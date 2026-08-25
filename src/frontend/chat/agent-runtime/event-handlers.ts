import type { ChatErrorCode, ChatErrorInfo, ChatServerToClientEvent } from '@/shared/chat/chat-api';
import { updateConversationTitleInCache } from '@/frontend/conversations/session';
import type { ChatState } from './chat-state';

/**
 * 每个会话各自记录已处理的最大 eventId，用于去重和断点续传。
 * 服务端事件带 eventId，客户端只处理 eventId > 当前会话游标的事件。
 */
const lastEventIds = new Map<string, number>();

export const getLastEventId = (conversationId: string) => lastEventIds.get(conversationId) ?? 0;

/** 重置指定会话的游标与打字缓冲；不传会话时用于切换页面的全量清理 */
export const resetLastEventId = (conversationId?: string) => {
  if (conversationId) {
    lastEventIds.delete(conversationId);
  } else {
    lastEventIds.clear();
  }
  resetStreamBuffer();
};

/** SSE data 字段的信封结构，由服务端序列化，反序列化后按此结构读取 */
type ServerMessagePayload = {
  eventId?: number;
  event?: ChatServerToClientEvent;
  assistantMessageId?: number;
  assistantCompletedAt?: string;
  remainingRuns?: number;
  status?: string;
  events?: { eventId: number; event: ChatServerToClientEvent; assistantMessageId?: number }[];
  activeRuns?: number[];
  finishedRuns?: { assistantMessageId: number; assistantCompletedAt?: string }[];
  recoveryRequired?: boolean;
};

/** 一条 SSE 消息 = { event, data } 信封 */
export type ServerMessage = { event: string; data: ServerMessagePayload };

export const parseServerMessage = (raw: unknown): ServerMessage | null => {
  if (typeof raw !== 'string') return null;
  try {
    const message: ServerMessage = JSON.parse(raw);
    if (typeof message.event === 'string') return message;
  } catch {
    // fallthrough
  }
  console.error('[WS] Malformed server message', { raw });
  return null;
};

/** 处理单条服务端消息（chat_event、chat_finished 等）。true 表示需要从持久化快照恢复。 */
export const handleServerMessage = (
  runtime: ChatState,
  message: ServerMessage,
  conversationId: string,
) => {
  const payload = message.data ?? {};

  switch (message.event) {
    case 'chat_event': {
      /* 单条聊天事件：需有 eventId 且大于 lastEventId 才处理，避免重复 */
      if (typeof payload.eventId !== 'number') return false;
      const lastEventId = lastEventIds.get(conversationId) ?? 0;
      if (payload.eventId <= lastEventId) return false;
      lastEventIds.set(conversationId, payload.eventId);

      if (!payload.event) return false;
      applyChatEventToTree(runtime, payload.event, payload.assistantMessageId ?? null);
      return false;
    }
    case 'chat_finished': {
      if (typeof payload.assistantMessageId !== 'number') return false;
      flushStreamBuffer();
      runtime.messageTree.unmarkAssistantStreaming(payload.assistantMessageId);
      if (typeof payload.assistantCompletedAt === 'string') {
        runtime.messageTree.stampAssistantCompletedAt(
          payload.assistantMessageId,
          payload.assistantCompletedAt,
        );
      }
      if (payload.remainingRuns === 0) {
        /* 最后一个 run 收口后，下一轮事件从当前会话的新游标重新开始。 */
        lastEventIds.delete(conversationId);
        runtime.setStatus('idle');
      }
      return false;
    }
    case 'chat_paused':
      // 服务端所有 run 都在等 askuserquestions 用户提交。当前流会关闭，
      // 用户提交答案后重新订阅，后续事件从事件游标继续到达。
      flushStreamBuffer();
      runtime.messageTree.clearStreamingAssistants();
      runtime.setStatus('idle');
      return false;
    case 'sync_response': {
      /* 断点续传：服务端返回已有事件列表，按 eventId 去重后依次应用 */
      flushStreamBuffer();
      runtime.setStatus(payload.status === 'running' ? 'streaming' : 'idle');
      let lastEventId = lastEventIds.get(conversationId) ?? 0;
      for (const record of payload.events ?? []) {
        if (record.eventId > lastEventId) {
          lastEventId = record.eventId;
          lastEventIds.set(conversationId, record.eventId);
          applyChatEventToTree(runtime, record.event, record.assistantMessageId ?? null);
        }
      }
      /* 流式标记以服务端 run 列表为准:活跃的标记,已收口的移除并补 completedAt */
      runtime.messageTree.clearStreamingAssistants();
      for (const id of payload.activeRuns ?? []) {
        runtime.messageTree.markAssistantStreaming(id);
      }
      for (const record of payload.finishedRuns ?? []) {
        if (typeof record.assistantCompletedAt === 'string') {
          runtime.messageTree.stampAssistantCompletedAt(
            record.assistantMessageId,
            record.assistantCompletedAt,
          );
        }
      }
      /* 回放事件会重新进入打字缓冲；同步结束后立即把它们写入消息树。 */
      flushStreamBuffer();
      return payload.recoveryRequired === true;
    }
  }

  return false;
};

/* ---------- 流式打字缓冲：把服务端一次到达的大段文本按帧逐步渲染 ---------- */

/** 每帧最多展示多少个 Unicode 码位（展开字符串迭代），过大则调快，过小则更平滑 */
const CHARS_PER_FRAME = 14;

type Segment =
  | { kind: 'content'; targetId: number; text: string; runtime: ChatState }
  | { kind: 'thinking'; targetId: number; text: string; runtime: ChatState }
  | { kind: 'artifact'; artifactId: string; text: string; runtime: ChatState };

let queue: Segment[] = [];
let rafId: number | null = null;

const schedulePump = () => {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(tick);
};

const tick = () => {
  rafId = null;
  if (queue.length === 0) {
    return;
  }

  const head = queue[0];
  if (!head.text) {
    queue.shift();
    schedulePump();
    return;
  }

  const units = [...head.text];
  const chunk = units.slice(0, CHARS_PER_FRAME).join('');
  head.text = units.slice(CHARS_PER_FRAME).join('');

  if (head.kind === 'content') {
    head.runtime.messageTree.appendToAssistant(head.targetId, { type: 'content', content: chunk });
  } else if (head.kind === 'thinking') {
    head.runtime.messageTree.appendToAssistant(head.targetId, { kind: 'thinking', text: chunk });
  } else {
    head.runtime.artifacts.appendCode(head.artifactId, chunk);
  }

  if (!head.text) {
    queue.shift();
  }

  if (queue.length > 0) {
    schedulePump();
  }
};

/** 目标不在当前查看的路径上时,没有打字动画的意义,直接整段写树,避免多流互相堵队列 */
const isTargetVisible = (runtime: ChatState, targetId: number) =>
  runtime.getMessageTree().currentPath.at(-1) === targetId;

const enqueueStreamContent = (runtime: ChatState, targetId: number, text: string) => {
  if (!text) return;
  if (!isTargetVisible(runtime, targetId)) {
    runtime.messageTree.appendToAssistant(targetId, { type: 'content', content: text });
    return;
  }
  const last = queue[queue.length - 1];
  if (last?.kind === 'content' && last.targetId === targetId && last.runtime === runtime) {
    last.text += text;
  } else {
    queue.push({ kind: 'content', targetId, text, runtime });
  }
  schedulePump();
};

const enqueueStreamThinking = (runtime: ChatState, targetId: number, text: string) => {
  if (!text) return;
  if (!isTargetVisible(runtime, targetId)) {
    runtime.messageTree.appendToAssistant(targetId, { kind: 'thinking', text });
    return;
  }
  const last = queue[queue.length - 1];
  if (last?.kind === 'thinking' && last.targetId === targetId && last.runtime === runtime) {
    last.text += text;
  } else {
    queue.push({ kind: 'thinking', targetId, text, runtime });
  }
  schedulePump();
};

const enqueueStreamArtifactCode = (runtime: ChatState, artifactId: string, delta: string) => {
  if (!delta) return;
  const last = queue[queue.length - 1];
  if (last?.kind === 'artifact' && last.artifactId === artifactId && last.runtime === runtime) {
    last.text += delta;
  } else {
    queue.push({ kind: 'artifact', artifactId, text: delta, runtime });
  }
  schedulePump();
};

/** 立即把缓冲中剩余的文本全部渲染出来（流结束或遇到非文本事件时调用） */
export const flushStreamBuffer = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (queue.length === 0) {
    return;
  }

  for (const seg of queue) {
    if (!seg.text) continue;
    if (seg.kind === 'content') {
      seg.runtime.messageTree.appendToAssistant(seg.targetId, {
        type: 'content',
        content: seg.text,
      });
    } else if (seg.kind === 'thinking') {
      seg.runtime.messageTree.appendToAssistant(seg.targetId, {
        kind: 'thinking',
        text: seg.text,
      });
    } else {
      seg.runtime.artifacts.appendCode(seg.artifactId, seg.text);
    }
  }
  queue = [];
};

/** 丢弃缓冲内容（新请求开始前调用，避免旧会话文本串场） */
export const resetStreamBuffer = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  queue = [];
};

/* ---------- 服务端事件 → 前端状态 ---------- */

const ERROR_COPY: Record<ChatErrorCode, { title: string; cause: string; suggestion: string }> = {
  invalid_request: {
    title: 'Request rejected',
    cause: 'The provider rejected the request format or parameters.',
    suggestion: 'Check the selected model, tools, and request payload.',
  },
  authentication_failed: {
    title: 'Authentication failed',
    cause: 'The upstream API key is invalid, expired, or missing.',
    suggestion: 'Check provider credentials or switch to another backend.',
  },
  permission_denied: {
    title: 'Permission denied',
    cause: 'The current provider key or account cannot access this resource.',
    suggestion: 'Check account permissions or switch to another backend.',
  },
  quota_exceeded: {
    title: 'Quota exceeded',
    cause: 'The account does not have enough prompt quota for this request.',
    suggestion: 'Redeem more quota before trying again.',
  },
  not_found: {
    title: 'Model or endpoint not found',
    cause: 'The configured model or upstream endpoint does not exist.',
    suggestion: 'Check the model mapping and backend base URL.',
  },
  conflict: {
    title: 'Request conflict',
    cause: 'The upstream service rejected the request because of a state conflict.',
    suggestion: 'Retry the request once the previous operation finishes.',
  },
  rate_limit: {
    title: 'Rate limit reached',
    cause: 'Too many requests were sent in a short time.',
    suggestion: 'Wait a moment and try again.',
  },
  model_unavailable: {
    title: 'Model unavailable',
    cause: 'The target model is loading, unavailable, or the upstream gateway cannot reach it.',
    suggestion: 'Retry later or switch to another model.',
  },
  service_unavailable: {
    title: 'Service unavailable',
    cause: 'The upstream service is overloaded, under maintenance, or temporarily unavailable.',
    suggestion: 'Retry later.',
  },
  timeout: {
    title: 'Request timed out',
    cause: 'The request took too long or the upstream service stopped responding in time.',
    suggestion: 'Retry later or try a faster model.',
  },
  network_error: {
    title: 'Network connection issue',
    cause: 'The connection to the upstream provider or proxy was interrupted.',
    suggestion: 'Check your network, then retry or switch backend.',
  },
  server_error: {
    title: 'Provider server error',
    cause: 'The upstream provider returned a 5xx server error.',
    suggestion: 'Retry later.',
  },
  provider_error: {
    title: 'Provider request failed',
    cause: 'The upstream provider returned an error that was not classified more specifically.',
    suggestion: 'Retry later or inspect provider logs.',
  },
  unknown: {
    title: 'Request failed',
    cause: 'The service or network encountered an unexpected error.',
    suggestion: 'Retry later or refresh the page.',
  },
};

const formatStructuredErrorMessage = (safeMessage: string, errorInfo: ChatErrorInfo) => {
  const copy = ERROR_COPY[errorInfo.code] ?? ERROR_COPY.unknown;
  const lines = [copy.title, `Possible cause: ${copy.cause}`, `Suggestion: ${copy.suggestion}`];

  if (errorInfo.provider) {
    lines.push(`Provider: ${errorInfo.provider}`);
  }

  if (errorInfo.model) {
    lines.push(`Model: ${errorInfo.model}`);
  }

  if (errorInfo.backend) {
    lines.push(`Backend: ${errorInfo.backend}`);
  }

  if (typeof errorInfo.status === 'number') {
    lines.push(`HTTP status: ${errorInfo.status}`);
  }

  if (typeof errorInfo.retryable === 'boolean') {
    lines.push(`Retryable: ${errorInfo.retryable ? 'yes' : 'no'}`);
  }

  const details = errorInfo.details || safeMessage;
  if (details) {
    lines.push(`Details: ${details}`);
  }

  return lines.join('\n');
};

export const enhanceServerErrorMessage = (safeMessage: string, errorInfo?: ChatErrorInfo) => {
  if (errorInfo) {
    return formatStructuredErrorMessage(safeMessage, errorInfo);
  }

  const lowerMessage = safeMessage.toLowerCase();

  if (lowerMessage.includes('load error') || lowerMessage.includes('load_error')) {
    return (
      `Model load failed: ${safeMessage}\n` +
      'Possible cause: network instability or model service unavailable.\n' +
      'Suggestion: retry later or switch to another model.'
    );
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return (
      `Request timed out: ${safeMessage}\n` +
      'Possible cause: network latency is too high or the server responded too slowly.\n' +
      'Suggestion: retry later.'
    );
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return (
      `Rate limit reached: ${safeMessage}\n` +
      'Possible cause: too many requests in a short time.\n' +
      'Suggestion: wait a moment and try again.'
    );
  }

  if (lowerMessage.includes('unavailable') || lowerMessage.includes('503')) {
    return (
      `Service unavailable: ${safeMessage}\n` +
      'Possible cause: maintenance or temporary overload.\n' +
      'Suggestion: retry later.'
    );
  }

  if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
    return (
      `Network connection issue: ${safeMessage}\n` +
      'Possible cause: unstable connection or interrupted request.\n' +
      'Suggestion: check your network and try again.'
    );
  }

  return (
    `Request failed: ${safeMessage}\n` +
    'Possible cause: service or network issue.\n' +
    'Suggestion: retry later or refresh the page.'
  );
};

export const applyChatEventToTree = (
  runtime: ChatState,
  event: ChatServerToClientEvent,
  assistantMessageId: number | null,
) => {
  if (event.type === 'tree_operation') {
    flushStreamBuffer();
    runtime.messageTree.applyTreeOperation(event);
    runtime.messageTree.markAssistantStreaming(event.assistantMessageId);
    return;
  }

  if (event.type === 'content') {
    if (assistantMessageId === null) return;
    enqueueStreamContent(runtime, assistantMessageId, event.content);
    return;
  }

  if (event.type === 'thinking') {
    if (assistantMessageId === null) return;
    enqueueStreamThinking(runtime, assistantMessageId, event.content);
    return;
  }

  if (event.type === 'artifact_code_delta') {
    enqueueStreamArtifactCode(runtime, event.artifactId, event.delta);
    return;
  }

  flushStreamBuffer();

  if (event.type === 'artifact_started') {
    runtime.artifacts.start(event.artifactId);
    return;
  }

  if (event.type === 'artifact_title') {
    runtime.artifacts.setTitle(event.artifactId, event.title);
    return;
  }

  if (event.type === 'artifact_language') {
    runtime.artifacts.setLanguage(event.artifactId, event.language);
    return;
  }

  if (event.type === 'artifact_completed') {
    runtime.artifacts.complete(event.artifactId);
    return;
  }

  if (event.type === 'artifact_failed') {
    runtime.artifacts.fail(event.artifactId, event.message);
    return;
  }

  if (event.type === 'conversation_updated') {
    if (runtime.getConversationId() === event.conversationId && typeof event.title === 'string') {
      runtime.setPageTitle(event.title);
    }

    if (event.title) {
      const now = event.updated_at ?? new Date().toISOString();
      updateConversationTitleInCache(event.conversationId, event.title, now);
      const ch = new BroadcastChannel('conversation_title');
      ch.postMessage({ id: event.conversationId, title: event.title, updated_at: now });
      ch.close();
    }
    return;
  }

  if (assistantMessageId === null) return;

  if (event.type === 'tool_call') {
    runtime.messageTree.appendToAssistant(assistantMessageId, {
      kind: 'tool',
      data: {
        call: { tool: event.tool, args: event.args },
      },
    });
    return;
  }

  if (event.type === 'tool_result') {
    runtime.messageTree.appendToAssistant(assistantMessageId, {
      kind: 'tool_result',
      tool: event.tool,
      result: event.result,
    });
    return;
  }

  if (event.type === 'ask_user_questions_requested') {
    runtime.messageTree.appendToAssistant(assistantMessageId, {
      kind: 'ask_user_questions_requested',
      callId: event.callId,
      questions: event.questions,
    });
    return;
  }

  if (event.type === 'ask_user_questions_answered') {
    runtime.messageTree.appendToAssistant(assistantMessageId, {
      kind: 'ask_user_questions_answered',
      callId: event.callId,
      answers: event.answers,
    });
    // 提交答案后 run 从暂停恢复，把 chat_paused 清掉的流式状态补回来。
    runtime.messageTree.markAssistantStreaming(assistantMessageId);
    runtime.setStatus('streaming');
    return;
  }

  if (event.type === 'error') {
    runtime.messageTree.appendToAssistant(assistantMessageId, {
      type: 'error',
      message: enhanceServerErrorMessage(event.message || 'unknown error', event.error),
    });
    return;
  }
};
