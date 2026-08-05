/**
 * chat-orchestrator.ts
 *
 * 聊天请求编排器：负责客户端与 Cloudflare Agent 之间的通信。
 *
 * 职责：
 * - 发起聊天请求（startChatRequest）
 * - 取消正在进行的 AI 回复（cancelAnswering）
 * - 恢复正在进行的对话流（resumeRunningConversation）
 * - 消费 SSE 流并分发事件到消息树
 *
 * 与 conversation-runner 服务端配合：/chat 返回服务端确认的用户消息，/events 通过 SSE
 * 接收 chat_event、chat_finished 等事件，并调用 event-handlers 更新 UI 状态。
 */
import type { AskUserQuestionsAnswer } from '@/features/chat/ask-user-questions/ask-user-questions';
import { applyChatEventToTree } from './event-handlers';
import { flushAll, reset as resetStreamDisplayBuffer } from './stream-display-buffer';
import type { ChatRuntimeState } from './chat-runtime-state';
import { isMessage } from '@/features/chat/message-thread';
import { appendConfirmedUserMessage } from '@/features/conversations/conversation-tree';
import type {
  ChatAgentStatus,
  ChatCommandResponse,
  ChatOperation,
  ChatServerToClientEvent,
} from '@/features/chat/chat-api';

/** Agent 路由名，对应 /agents/conversation-runner */
const AGENT_NAME = 'conversation-runner';
/** 对话已在生成回复时的提示文案 */
const BUSY_WARNING = 'This conversation is already generating a response.';
/** 未选择角色时的提示文案 */
const SELECT_MODEL_WARNING = 'Select a model before sending a message.';

/**
 * 已处理的最大 eventId，用于去重和断点续传。
 * 服务端事件带 eventId，客户端只处理 eventId > lastEventId 的事件。
 */
let lastEventId = 0;

/** 重置 lastEventId，每次新请求前调用，避免沿用旧会话的 eventId */
export const resetLastEventId = () => {
  lastEventId = 0;
  resetStreamDisplayBuffer();
};

/**
 * 当前活跃的 AbortController。
 * 同一时刻只允许一个请求在跑，新请求会 abort 掉旧的。
 */
let activeController: AbortController | null = null;
let activeRequestAcceptedCallback: ((response: ChatCommandResponse) => void) | null = null;
let activeRequestStarted = false;
let stopWaiters: (() => void)[] = [];

let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectConversationId: string | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
/** 退避序列：1s, 2s, 4s, 8s, 16s */
const BASE_RECONNECT_DELAY = 1000;

const clearReconnectState = () => {
  reconnectAttempt = 0;
  reconnectConversationId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const waitForStopFinished = () => {
  let resolveStop = () => {};
  const promise = new Promise<void>((resolve) => {
    const finish = () => resolve();
    resolveStop = finish;
    stopWaiters.push(finish);
  });

  return {
    promise,
    cancel: () => {
      stopWaiters = stopWaiters.filter((resolve) => resolve !== resolveStop);
    },
  };
};

const resolveStopWaiters = () => {
  const waiters = stopWaiters;
  stopWaiters = [];
  for (const resolve of waiters) {
    resolve();
  }
};

const scheduleAutoReconnect = (runtime: ChatRuntimeState, conversationId: string) => {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    clearReconnectState();
    runtime.toast.error('连接已断开');
    runtime.setStatus('idle');
    return;
  }

  reconnectConversationId = conversationId;
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt);
  reconnectAttempt++;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    const currentId = runtime.getSession().conversationId;
    if (currentId !== conversationId || reconnectConversationId !== conversationId) {
      clearReconnectState();
      return;
    }

    runtime.toast.info('重新连接中...');
    await resumeRunningConversation(runtime, conversationId, true);
  }, delay);
};

/**
 * 解析 Agent 的 base URL。
 * 根据当前页面的 protocol 与 host 拼接，SSR 时回退到 localhost:3100。
 */
const resolveAgentBaseUrl = () => {
  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3100';
  return `${protocol}://${host}/agents/${AGENT_NAME}`;
};

/**
 * 生成唯一 ID。
 * 优先用 crypto.randomUUID()，不支持时用 prefix + 时间戳 + 随机数。
 */
const generateId = (prefix = 'id') =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

/** 判断是否为 AbortController 触发的取消错误，用于静默忽略用户主动停止 */
const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError');

const getResponseErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (typeof data === 'object' && data !== null) {
      if ('error' in data && typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
      if ('message' in data && typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
    }
    return null;
  }

  const message = (await response.text()).trim();
  return message || null;
};

/**
 * 流结束后的收尾逻辑。
 * 异常结束时尝试自动重连；正常 idle 或无法重连时清理重连状态。
 */
const finalizeStream = (runtime: ChatRuntimeState) => {
  if (runtime.getStatus() !== 'idle') {
    const conversationId = runtime.getSession().conversationId;
    if (conversationId) {
      scheduleAutoReconnect(runtime, conversationId);
      return;
    }
    runtime.setStatus('idle');
  }
  clearReconnectState();
};

const applyChatAcceptedPayload = (runtime: ChatRuntimeState, value: unknown) => {
  const acceptedPayload = parseChatCommandResponse(value);
  if (!acceptedPayload) {
    throw new Error('Invalid chat response');
  }
  const sessionState = runtime.getSession();
  if (
    sessionState.conversationId &&
    sessionState.conversationId !== acceptedPayload.conversationId
  ) {
    throw new Error('Conversation ID mismatch');
  }

  if (acceptedPayload.type === 'append') {
    const nextTree = appendConfirmedUserMessage(
      {
        messages: sessionState.messages,
        currentPath: sessionState.currentPath,
        latestRootId: sessionState.latestRootId,
        nextId: sessionState.nextId,
      },
      {
        type: 'append',
        message: { role: 'user', blocks: acceptedPayload.message.blocks },
        parentId: acceptedPayload.message.parentId,
        previousSiblingId: acceptedPayload.message.prevSibling,
      },
      acceptedPayload.message,
    );
    if (!nextTree) {
      throw new Error('Failed to append confirmed user message');
    }
    runtime.session.setTreeState(nextTree);
  }

  runtime.session.setConversationId(acceptedPayload.conversationId);
  activeRequestStarted = true;
  activeRequestAcceptedCallback?.(acceptedPayload);
  activeRequestAcceptedCallback = null;
};

const parseChatCommandResponse = (value: unknown): ChatCommandResponse | null => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    !('conversationId' in value) ||
    typeof value.conversationId !== 'string' ||
    !value.conversationId
  ) {
    return null;
  }

  if (value.type === 'regenerate') {
    return { type: 'regenerate', conversationId: value.conversationId };
  }

  if (
    value.type === 'append' &&
    'message' in value &&
    isMessage(value.message) &&
    value.message.role === 'user'
  ) {
    return {
      type: 'append',
      conversationId: value.conversationId,
      message: value.message,
    };
  }

  return null;
};

/**
 * 处理单条 SSE 消息。
 * @param event - SSE 的 event 字段（如 chat_event、chat_finished 等）
 * @param raw - data 字段的原始 JSON 字符串
 */
const handleSSEMessage = (runtime: ChatRuntimeState, event: string, raw: string) => {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  switch (event) {
    case 'chat_event': {
      /* 单条聊天事件：需有 eventId 且大于 lastEventId 才处理，避免重复 */
      if (typeof payload.eventId !== 'number') return;
      if (payload.eventId <= lastEventId) return;
      lastEventId = payload.eventId;

      applyChatEventToTree(runtime, payload.event as ChatServerToClientEvent);
      return;
    }
    case 'chat_finished':
      clearReconnectState();
      flushAll();
      if (typeof payload.assistantCompletedAt === 'string') {
        runtime.session.stampAssistantCompletedAt(payload.assistantCompletedAt);
      }
      runtime.setStatus('idle');
      resolveStopWaiters();
      return;
    case 'chat_paused':
      // 服务端调用 askuserquestions 后会先发 chat_paused 再关闭 SSE，
      // background task 仍在等 /tool-answer。前端把当前请求视为结束，
      // 等用户提交答案后由 submitToolAnswer 触发 resumeRunningConversation。
      clearReconnectState();
      flushAll();
      runtime.setStatus('idle');
      return;
    case 'sync_response': {
      /* 断点续传：服务端返回已有事件列表，按 eventId 去重后依次应用 */
      flushAll();
      runtime.setStatus(payload.status === 'running' ? 'streaming' : 'idle');
      if (Array.isArray(payload.events)) {
        for (const item of payload.events) {
          const record = item as Record<string, unknown>;
          if (typeof record.eventId === 'number' && record.eventId > lastEventId) {
            lastEventId = record.eventId;
            applyChatEventToTree(runtime, record.event as ChatServerToClientEvent);
          }
        }
      }
      if (typeof payload.assistantCompletedAt === 'string') {
        runtime.session.stampAssistantCompletedAt(payload.assistantCompletedAt);
      }
      return;
    }
    case 'busy':
      runtime.toast.warning(BUSY_WARNING);
      runtime.setStatus('streaming');
      return;
  }
};

/**
 * 消费 SSE 流式响应。
 * 以 \n\n 分割事件块，解析 event: 与 data: 行，调用 handleSSEMessage 处理。
 * 支持 signal 中断；结束时调用 reader.cancel 释放资源。
 */
const consumeStreamResponse = async (runtime: ChatRuntimeState, response: Response) => {
  const signal = activeController!.signal;
  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  /** 从 buffer 中按 \n\n 切出完整事件块，解析并分发 */
  const flush = () => {
    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex >= 0) {
      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf('\n\n');

      if (!block.trim()) continue;

      let event = 'message';
      const dataLines: string[] = [];

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trimStart();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length > 0) {
        handleSSEMessage(runtime, event, dataLines.join('\n'));
      }
    }
  };

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      flush();
    }
    buffer += decoder.decode().replace(/\r\n/g, '\n');
    flush();
  } finally {
    flushAll();
    await Promise.allSettled([reader.cancel()]);
  }
};

/**
 * 探测指定对话的 Agent 状态。
 * GET /agents/conversation-runner/:conversationId，返回 idle | running | completed | aborted | error。
 * 404 视为 idle。
 */
export const checkAgentStatus = async (
  conversationId: string,
): Promise<{ status: ChatAgentStatus }> => {
  const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 404) return { status: 'idle' };
  if (!response.ok) throw new Error(`Agent status probe failed: ${response.status}`);

  const data = (await response.json()) as Record<string, unknown>;
  const status = data.status;

  return {
    status:
      status === 'idle' ||
      status === 'running' ||
      status === 'completed' ||
      status === 'aborted' ||
      status === 'error'
        ? status
        : 'idle',
  };
};

/**
 * 发起一次聊天请求。
 *
 * 流程：
 * 1. 校验 status 为 idle、已选模型
 * 2. 发起 POST /chat，等待服务端落库并返回正式用户消息
 * 3. append 服务端响应后，再连接 /events 消费 assistant SSE
 *
 * 异常：AbortError 静默忽略；TypeError（如网络错误）调用 finalizeStream；其他恢复 idle。
 */
export const startChatRequest = async (
  runtime: ChatRuntimeState,
  operation: ChatOperation,
  onAccepted?: (response: ChatCommandResponse) => void,
) => {
  const sessionState = runtime.getSession();

  resetLastEventId();
  activeRequestStarted = false;
  if (!sessionState.currentModelId) {
    runtime.toast.warning(SELECT_MODEL_WARNING);
    runtime.setStatus('idle');
    return;
  }

  const conversationId = sessionState.conversationId;
  const idempotencyKey = generateId('msg'); /* 幂等键，防止重复提交 */

  if (
    !conversationId &&
    (operation.type !== 'append' ||
      operation.parentId !== null ||
      operation.previousSiblingId !== null)
  ) {
    runtime.setStatus('idle');
    throw new Error('Conversation not found');
  }

  const body = {
    idempotencyKey,
    model: sessionState.currentModelId,
    promptId: sessionState.currentPromptId || undefined,
    fetchProvider: sessionState.currentFetchProvider,
    conversationId,
    operation,
  };

  activeController?.abort(); /* 取消之前的请求，保证同一时刻只有一个在跑 */
  const controller = new AbortController();
  activeController = controller;
  activeRequestAcceptedCallback = onAccepted ?? null;
  runtime.setStatus('sending');
  let acceptedConversationId: string | null = conversationId;

  try {
    const response = await fetch(
      conversationId
        ? `${resolveAgentBaseUrl()}/${conversationId}/chat`
        : `${resolveAgentBaseUrl()}/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const message =
        (await getResponseErrorMessage(response)) ?? `Chat request failed: ${response.status}`;
      runtime.toast.error(message);
      runtime.setStatus('idle');
      activeRequestAcceptedCallback = null;
      return;
    }

    const acceptedPayload = parseChatCommandResponse(await response.json());
    if (!acceptedPayload) {
      throw new Error('Invalid chat response');
    }
    acceptedConversationId = acceptedPayload.conversationId;
    applyChatAcceptedPayload(runtime, acceptedPayload);
    runtime.setStatus('streaming');

    const eventsResponse = await fetch(
      `${resolveAgentBaseUrl()}/${acceptedPayload.conversationId}/events`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastEventId }),
        signal: controller.signal,
      },
    );
    await consumeStreamResponse(runtime, eventsResponse);
    finalizeStream(runtime);
  } catch (error) {
    if (isAbortError(error)) {
      activeRequestAcceptedCallback = null;
      runtime.setStatus('idle');
      return;
    }

    const currentStatus = runtime.getStatus();
    if (error instanceof TypeError && currentStatus !== 'idle' && acceptedConversationId) {
      runtime.session.setConversationId(acceptedConversationId);
      scheduleAutoReconnect(runtime, acceptedConversationId);
      return;
    }

    runtime.setStatus('idle');
    activeRequestAcceptedCallback = null;
    const message =
      error instanceof TypeError ? '连接中断' : error instanceof Error ? error.message : '请求失败';
    if (activeRequestStarted) {
      applyChatEventToTree(runtime, {
        type: 'error',
        message,
        error: {
          code: error instanceof TypeError ? 'network_error' : 'unknown',
          retryable: error instanceof TypeError,
          details: message,
        },
      });
    } else {
      runtime.toast.error(message);
    }
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
};

export const cancelSending = async (runtime: ChatRuntimeState, _reason: string) => {
  if (runtime.getStatus() !== 'sending') {
    return;
  }

  clearReconnectState();
  flushAll();
  activeController?.abort();
  activeController = null;
  activeRequestAcceptedCallback = null;
  runtime.setStatus('idle');
};

/**
 * 取消订阅流式输出。
 * abort 本地 activeController，将 status 设为 idle。
 */
export const cancelStreamSubscription = (runtime: ChatRuntimeState, _reason: string) => {
  clearReconnectState();
  flushAll();
  activeController?.abort();
  activeController = null;
  activeRequestAcceptedCallback = null;
  resolveStopWaiters();

  runtime.setStatus('idle');
};

/**
 * 取消正在进行的 AI 回复。
 * 保持 SSE 连接，等服务端 abort 后通过 chat_finished 收口。
 */
export const cancelAnswering = async (runtime: ChatRuntimeState, _reason: string) => {
  const conversationId = runtime.getSession().conversationId;
  const status = runtime.getStatus();

  if (status === 'idle') {
    return;
  }

  if (status === 'stopping') {
    await waitForStopFinished().promise;
    return;
  }

  if (!conversationId) {
    return;
  }

  runtime.setStatus('stopping');

  const stopFinished = waitForStopFinished();

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Abort request failed: ${response.status}`);
    }

    await stopFinished.promise;
  } catch (error) {
    stopFinished.cancel();
    runtime.setStatus('streaming');
    throw error;
  }
};

export const submitToolAnswer = async (
  runtime: ChatRuntimeState,
  callId: string,
  answers: AskUserQuestionsAnswer[],
) => {
  const conversationId = runtime.getSession().conversationId;

  if (!conversationId) {
    throw new Error('Conversation not found');
  }

  runtime.session.setAskUserQuestionsBlockStatus(callId, 'submitting');

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/tool-answer`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, answers }),
    });

    if (response.ok) {
      void resumeRunningConversation(runtime, conversationId);
      return;
    }

    const message = (await getResponseErrorMessage(response)) ?? `提交失败: ${response.status}`;

    throw new Error(message);
  } catch (error) {
    runtime.session.setAskUserQuestionsBlockStatus(callId, 'pending');
    runtime.toast.error(error instanceof Error ? error.message : '提交失败');
    throw error;
  }
};

/**
 * 恢复正在进行的对话流（如页面刷新后重新进入对话页）。
 *
 * 流程：
 * 1. 将 status 设为 sending，再调用 checkAgentStatus；若非 running 则 idle 返回
 * 2. 创建 AbortController，通过 activeController 与 cancelStreamSubscription 联动
 * 3. POST /agents/conversation-runner/:conversationId/events，body 为 { lastEventId }
 * 4. 消费返回的 SSE 流（sync_response + 后续 chat_event）
 * 5. 结束时 finalizeStream
 *
 * 取消方式：对话页卸载时调用 cancelStreamSubscription 即可 abort
 */
export const resumeRunningConversation = async (
  runtime: ChatRuntimeState,
  conversationId: string,
  replayCompletedEvents = false,
) => {
  if (activeController && runtime.getStatus() === 'streaming') {
    return;
  }

  runtime.setStatus('sending');

  let agentStatus: { status: ChatAgentStatus };

  try {
    agentStatus = await checkAgentStatus(conversationId);
  } catch (error) {
    console.error('Failed to probe agent status:', error);
    if (reconnectConversationId === conversationId) {
      scheduleAutoReconnect(runtime, conversationId);
    } else {
      runtime.setStatus('idle');
      runtime.toast.error(error instanceof Error ? error.message : '请求失败');
    }
    return;
  }

  if (
    agentStatus.status !== 'running' &&
    !(replayCompletedEvents && agentStatus.status !== 'idle')
  ) {
    clearReconnectState();
    activeRequestAcceptedCallback = null;
    runtime.setStatus('idle');
    return;
  }

  const controller = new AbortController();
  activeController = controller;

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastEventId }),
      signal: controller.signal,
    });

    await consumeStreamResponse(runtime, response);

    if (runtime.getStatus() === 'idle') {
      clearReconnectState();
      return;
    }

    finalizeStream(runtime);
  } catch (error) {
    if (isAbortError(error)) return;

    if (error instanceof TypeError && reconnectConversationId === conversationId) {
      scheduleAutoReconnect(runtime, conversationId);
      return;
    }

    runtime.setStatus('idle');
    runtime.toast.error(
      error instanceof TypeError ? '连接中断' : error instanceof Error ? error.message : '请求失败',
    );
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
};
