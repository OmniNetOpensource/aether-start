/**
 * chat-orchestrator.ts
 *
 * 聊天请求编排器：负责客户端与 Cloudflare Agent 之间的通信。
 *
 * 职责：
 * - 发起聊天请求（startChatRequest）,同一会话可多个 run 并发
 * - 取消正在进行的 AI 回复（cancelAnswering）
 * - 恢复正在进行的对话流（resumeRunningConversation）
 * - 断线自动重连
 *
 * 与 conversation-runner 服务端配合：/chat 只回回执,树变更经 tree_operation 事件送达;
 * /events 是会话级订阅,一条连接接收所有 run 的 chat_event、chat_finished 等事件。
 */
import type { AskUserQuestionsAnswer } from '@/shared/chat/ask-user-questions';
import {
  applyChatEventToTree,
  flushStreamBuffer,
  followTreeOperation,
  getLastEventId,
  handleSSEMessage,
  resetLastEventId,
} from './event-handlers';
import type { ChatState } from './chat-state';
import { readSSEStream } from './sse-stream';
import { setQueuedMessages } from '@/frontend/chat/composer/composer-request/message-queue';
import type { ChatAgentStatus, ChatCommandResponse, ChatOperation } from '@/shared/chat/chat-api';

/** Agent 路由名，对应 /agents/conversation-runner */
const AGENT_NAME = 'conversation-runner';
/** 未选择角色时的提示文案 */
const SELECT_MODEL_WARNING = 'Select a model before sending a message.';

/**
 * 当前会话 /events 订阅的 AbortController。
 * 订阅属于会话而非单次请求:一条连接接收所有 run 的广播,只在切会话/卸载时 abort。
 */
let activeController: AbortController | null = null;

/**
 * 正在等待服务端 abort 收口的 Promise。
 * cancelAnswering 创建它，流结束（finalizeStream）或 cancelStreamSubscription 收口它。
 */
let stopFinished: { promise: Promise<void>; resolve: () => void } | null = null;

const waitForStopFinished = () => {
  if (!stopFinished) {
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    stopFinished = { promise, resolve };
  }
  return stopFinished.promise;
};

const resolveStopFinished = () => {
  stopFinished?.resolve();
  stopFinished = null;
};

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

const scheduleAutoReconnect = (runtime: ChatState, conversationId: string) => {
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

    const currentId = runtime.getConversationId();
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
 * 根据当前页面的 protocol 与 host 拼接。
 */
const resolveAgentBaseUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.host}/agents/${AGENT_NAME}`;
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

/** 把异常转成面向用户的文案：网络错误 → 连接中断，其他保留 message */
const describeError = (error: unknown) =>
  error instanceof TypeError ? '连接中断' : error instanceof Error ? error.message : '请求失败';

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

/** 消费 /events 的 SSE 流，逐条消息交给 handleSSEMessage；结束时兜底 flush 打字缓冲 */
const consumeEvents = async (runtime: ChatState, response: Response, signal: AbortSignal) => {
  try {
    await readSSEStream(response, signal, (event, data) => handleSSEMessage(runtime, event, data));
  } finally {
    flushStreamBuffer();
  }
};

/**
 * 流结束后的收尾逻辑。
 * 正常结束（chat_finished/chat_paused 已置 idle）时清理重连状态并收口 stopFinished；
 * 异常结束（status 仍非 idle）时尝试自动重连。
 */
const finalizeStream = (runtime: ChatState) => {
  if (runtime.getStatus() !== 'idle') {
    const conversationId = runtime.getConversationId();
    if (conversationId) {
      scheduleAutoReconnect(runtime, conversationId);
      return;
    }
    runtime.setStatus('idle');
  }
  clearReconnectState();
  resolveStopFinished();
};

/**
 * 探测指定对话的 Agent 状态。
 * GET /agents/conversation-runner/:conversationId，返回 idle | running | completed | aborted | error。
 * 404 视为 idle。
 */
export const checkAgentStatus = async (
  conversationId: string,
  signal?: AbortSignal,
): Promise<{ status: ChatAgentStatus }> => {
  const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}`, {
    method: 'GET',
    credentials: 'include',
    signal,
  });

  if (response.status === 404) return { status: 'idle' };
  if (!response.ok) throw new Error(`Agent status probe failed: ${response.status}`);

  const data: { status: ChatAgentStatus } = await response.json();
  return data;
};

/**
 * 发起一次聊天请求。
 *
 * 流程：
 * 1. 校验已选模型与会话 ID 规则
 * 2. POST /chat,服务端应用树操作后回执 { conversationId, assistantMessageId }
 * 3. 树变更由 tree_operation 事件送达;若当前没有 /events 订阅则建立一条,有则复用
 *
 * 多 run 并发:流式期间再次调用本函数不会打断已有的流,新 run 的事件走同一条订阅。
 * 异常：AbortError 静默忽略；TypeError（如网络错误）走自动重连；其他恢复状态并提示。
 */
export const startChatRequest = async (
  runtime: ChatState,
  operation: ChatOperation,
  onAccepted?: (response: ChatCommandResponse) => void,
) => {
  const modelId = runtime.getCurrentModelId();
  if (!modelId) {
    runtime.toast.warning(SELECT_MODEL_WARNING);
    return;
  }

  const conversationId = runtime.getConversationId();
  const idempotencyKey = generateId('msg'); /* 幂等键，防止重复提交 */

  if (
    !conversationId &&
    (operation.type !== 'append' ||
      operation.parentId !== null ||
      operation.previousSiblingId !== null)
  ) {
    throw new Error('Conversation not found');
  }

  const body = {
    idempotencyKey,
    model: modelId,
    promptId: runtime.getCurrentPromptId() || undefined,
    fetchProvider: runtime.getCurrentFetchProvider(),
    conversationId,
    operation,
  };

  /* 没有活跃订阅时本次请求负责建立它;已有订阅(其他 run 在流式)则复用,POST 挂它的 signal */
  const ownsSubscription = activeController === null;
  const controller = activeController ?? new AbortController();
  activeController = controller;
  if (ownsSubscription) {
    /* DO 可能在空闲后被驱逐重建,eventId 会从 1 重新计数;无订阅意味着没有在途事件,重置是安全的 */
    resetLastEventId();
    runtime.setStatus('sending');
  }
  /* 服务端是否已接受请求:接受后出错要写进消息树,接受前只弹 toast */
  let acceptedAssistantMessageId: number | null = null;

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
      if (ownsSubscription) {
        runtime.setStatus('idle');
      }
      return;
    }

    const acceptedPayload: ChatCommandResponse = await response.json();
    if (conversationId && conversationId !== acceptedPayload.conversationId) {
      throw new Error('Conversation ID mismatch');
    }
    runtime.setConversationId(acceptedPayload.conversationId);
    followTreeOperation(acceptedPayload.assistantMessageId);
    acceptedAssistantMessageId = acceptedPayload.assistantMessageId;
    onAccepted?.(acceptedPayload);
    runtime.setStatus('streaming');

    if (!ownsSubscription) {
      /* 已有订阅在接收广播,本请求到此为止 */
      return;
    }

    const eventsResponse = await fetch(
      `${resolveAgentBaseUrl()}/${acceptedPayload.conversationId}/events`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastEventId: getLastEventId() }),
        signal: controller.signal,
      },
    );
    await consumeEvents(runtime, eventsResponse, controller.signal);
    finalizeStream(runtime);
  } catch (error) {
    if (isAbortError(error)) {
      if (ownsSubscription) {
        runtime.setStatus('idle');
      }
      return;
    }

    const reconnectId = runtime.getConversationId();
    if (error instanceof TypeError && acceptedAssistantMessageId !== null && reconnectId) {
      scheduleAutoReconnect(runtime, reconnectId);
      return;
    }

    if (ownsSubscription) {
      runtime.setStatus('idle');
    }
    const message = describeError(error);
    if (acceptedAssistantMessageId !== null) {
      applyChatEventToTree(
        runtime,
        {
          type: 'error',
          message,
          error: {
            code: error instanceof TypeError ? 'network_error' : 'unknown',
            retryable: error instanceof TypeError,
            details: message,
          },
        },
        acceptedAssistantMessageId,
      );
    } else {
      runtime.toast.error(message);
    }
  } finally {
    if (ownsSubscription && activeController === controller) {
      activeController = null;
    }
  }
};

export const cancelSending = async (runtime: ChatState, reason: string) => {
  if (runtime.getStatus() !== 'sending') {
    return;
  }
  cancelStreamSubscription(runtime, reason);
};

/**
 * 取消订阅流式输出。
 * abort 本地 activeController，将 status 设为 idle，并清空排队消息与流式标记。
 */
export const cancelStreamSubscription = (runtime: ChatState, _reason: string) => {
  clearReconnectState();
  flushStreamBuffer();
  activeController?.abort();
  activeController = null;
  resolveStopFinished();
  setQueuedMessages([]);
  runtime.messageTree.clearStreamingAssistants();

  runtime.setStatus('idle');
};

/**
 * 取消正在进行的 AI 回复。
 * 保持 SSE 连接，等服务端 abort 后通过 chat_finished 收口。
 * 带 assistantMessageId 时只停对应 run;不带则停全部(composer 停止按钮)。
 */
export const cancelAnswering = async (
  runtime: ChatState,
  _reason: string,
  assistantMessageId?: number,
) => {
  const conversationId = runtime.getConversationId();
  const status = runtime.getStatus();

  if (status === 'idle') {
    return;
  }

  if (status === 'stopping') {
    await waitForStopFinished();
    return;
  }

  if (!conversationId) {
    return;
  }

  /* 只停单个 run 时不动全局 status:其他 run 还在流式,收口由对应 chat_finished 驱动 */
  const stopsAll = assistantMessageId === undefined;
  if (stopsAll) {
    runtime.setStatus('stopping');
  }
  const finished = stopsAll ? waitForStopFinished() : null;

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stopsAll ? {} : { assistantMessageId }),
    });

    if (!response.ok) {
      throw new Error(`Abort request failed: ${response.status}`);
    }

    if (finished) {
      await finished;
    }
  } catch (error) {
    if (stopsAll) {
      runtime.setStatus('streaming');
    }
    throw error;
  }
};

export const submitToolAnswer = async (
  runtime: ChatState,
  callId: string,
  answers: AskUserQuestionsAnswer[],
) => {
  const conversationId = runtime.getConversationId();

  if (!conversationId) {
    throw new Error('Conversation not found');
  }

  runtime.messageTree.setAskUserQuestionsBlockStatus(callId, 'submitting');

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
    runtime.messageTree.setAskUserQuestionsBlockStatus(callId, 'pending');
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
  runtime: ChatState,
  conversationId: string,
  replayCompletedEvents = false,
) => {
  if (activeController && runtime.getStatus() === 'streaming') {
    return;
  }

  /* 从发起探测的那一刻起就占据 activeController，
     让切换会话时的 cancelStreamSubscription 能 abort 掉还在探测中的 resume，
     避免旧会话的事件流叠加到新会话的消息树上 */
  const controller = new AbortController();
  activeController = controller;
  runtime.setStatus('sending');

  let agentStatus: { status: ChatAgentStatus };

  try {
    agentStatus = await checkAgentStatus(conversationId, controller.signal);
  } catch (error) {
    if (isAbortError(error)) return;
    console.error('Failed to probe agent status:', error);
    if (reconnectConversationId === conversationId) {
      scheduleAutoReconnect(runtime, conversationId);
    } else {
      runtime.setStatus('idle');
      runtime.toast.error(error instanceof Error ? error.message : '请求失败');
    }
    return;
  }

  if (controller.signal.aborted) return;

  if (
    agentStatus.status !== 'running' &&
    !(replayCompletedEvents && agentStatus.status !== 'idle')
  ) {
    clearReconnectState();
    if (activeController === controller) {
      activeController = null;
    }
    runtime.setStatus('idle');
    return;
  }

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastEventId: getLastEventId() }),
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    await consumeEvents(runtime, response, controller.signal);
    finalizeStream(runtime);
  } catch (error) {
    if (isAbortError(error)) return;

    if (error instanceof TypeError && reconnectConversationId === conversationId) {
      scheduleAutoReconnect(runtime, conversationId);
      return;
    }

    runtime.setStatus('idle');
    runtime.toast.error(describeError(error));
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
};
