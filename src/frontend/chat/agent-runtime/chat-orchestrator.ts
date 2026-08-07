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
 * 与 conversation-runner 服务端配合：/chat 回执带回 user 消息与 assistant 占位,发起方据此建容器;
 * /events 是会话级 WebSocket 订阅,一条连接接收所有 run 的 chat_event、chat_finished 等事件。
 */
import type { AskUserQuestionsAnswer } from '@/shared/chat/ask-user-questions';
import {
  applyChatEventToTree,
  flushStreamBuffer,
  getLastEventId,
  handleServerMessage,
  parseServerMessage,
  resetLastEventId,
} from './event-handlers';
import type { ChatState } from './chat-state';
import { setQueuedMessages } from '@/frontend/chat/composer/composer-request/message-queue';
import type { ChatAgentStatus, ChatCommandResponse, Operation } from '@/shared/chat/chat-api';

/** Agent 路由名，对应 /agents/conversation-runner */
const AGENT_NAME = 'conversation-runner';
/** 未选择角色时的提示文案 */
const SELECT_MODEL_WARNING = 'Select a model before sending a message.';

/**
 * 当前会话 /events 的 WebSocket 订阅。
 * 订阅属于会话而非单次请求:一条连接接收所有 run 的广播,只在切会话/卸载时关闭。
 */
let activeSocket: WebSocket | null = null;

/**
 * resume 探测期间尚未建立 socket,但也需要能被 cancelStreamSubscription 取消。
 * 探测用的 AbortController 挂在这里,socket 建立后清空。
 */
let probeController: AbortController | null = null;

/**
 * 正在等待服务端 abort 收口的 Promise。
 * cancelAnswering 创建它，流结束（chat_finished 置 idle 后 socket 收口）或 cancelStreamSubscription 收口它。
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

const resolveAgentSocketUrl = (conversationId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/agents/${AGENT_NAME}/${conversationId}/events`;
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

/**
 * 建立会话级 /events WebSocket 订阅。
 *
 * onopen 发送 { lastEventId } 触发服务端补拉（sync_response），之后被动接收广播。
 * onclose 收口：连接被本地主动替换/关闭时静默；status 已 idle 时正常收尾；
 * 否则视为异常断开，走自动重连。
 */
const openEventSocket = (runtime: ChatState, conversationId: string) => {
  const socket = new WebSocket(resolveAgentSocketUrl(conversationId));
  activeSocket = socket;
  probeController = null;

  socket.onopen = () => {
    socket.send(JSON.stringify({ lastEventId: getLastEventId() }));
  };

  socket.onmessage = (event) => {
    const message = parseServerMessage(event.data);
    if (message) {
      handleServerMessage(runtime, message);
    }
  };

  socket.onclose = () => {
    flushStreamBuffer();

    /* 已被新连接取代或主动关闭（cancelStreamSubscription 置 null 后 close），不做收口 */
    if (activeSocket !== socket) {
      return;
    }
    activeSocket = null;

    if (runtime.getStatus() !== 'idle') {
      scheduleAutoReconnect(runtime, conversationId);
      return;
    }
    clearReconnectState();
    resolveStopFinished();
  };
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
 * 2. POST /chat,服务端应用树操作后回执 { conversationId, userMessage, assistantMessage }
 * 3. 发起方用回执直接创建 user 消息与 assistant 占位容器;若当前没有 /events 订阅则建立一条,有则复用
 *
 * 多 run 并发:流式期间再次调用本函数不会打断已有的流,新 run 的事件走同一条订阅。
 * 异常：TypeError（如网络错误）在服务端已接受后走自动重连；其他恢复状态并提示。
 */
export const startChatRequest = async (
  runtime: ChatState,
  operation: Operation,
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

  /* 没有活跃订阅时本次请求负责建立它;已有订阅(其他 run 在流式)则复用 */
  const ownsSubscription = activeSocket === null;
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
    /* 回执即容器:直接放入 user 消息与 assistant 占位,视野跟到新分支 */
    runtime.messageTree.applyChatAccepted(
      acceptedPayload.userMessage,
      acceptedPayload.assistantMessage,
    );
    runtime.messageTree.markAssistantStreaming(acceptedPayload.assistantMessage.id);
    acceptedAssistantMessageId = acceptedPayload.assistantMessage.id;
    onAccepted?.(acceptedPayload);
    runtime.setStatus('streaming');

    /* POST 期间可能有其他调用建立了订阅（如另一个 run），再查一次 */
    if (ownsSubscription && activeSocket === null) {
      openEventSocket(runtime, acceptedPayload.conversationId);
    }
  } catch (error) {
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
 * 关闭本地 WebSocket / 中止 resume 探测，将 status 设为 idle，并清空排队消息与流式标记。
 */
export const cancelStreamSubscription = (runtime: ChatState, _reason: string) => {
  clearReconnectState();
  flushStreamBuffer();
  probeController?.abort();
  probeController = null;
  const socket = activeSocket;
  activeSocket = null; /* 先置 null,让 onclose 识别为主动关闭 */
  socket?.close();
  resolveStopFinished();
  setQueuedMessages([]);
  runtime.messageTree.clearStreamingAssistants();

  runtime.setStatus('idle');
};

/**
 * 取消正在进行的 AI 回复。
 * 保持 WebSocket 连接，等服务端 abort 后通过 chat_finished 收口。
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
      /* WebSocket 保持打开,后续事件从同一条连接到达;仅在连接已丢失时重建订阅 */
      if (activeSocket === null) {
        void resumeRunningConversation(runtime, conversationId);
      }
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
 * 2. 探测通过后建立 /events WebSocket 订阅（sync_response + 后续 chat_event）
 *
 * 探测期间用 probeController 联动 cancelStreamSubscription，
 * 避免切换会话时旧会话的事件流叠加到新会话的消息树上。
 */
export const resumeRunningConversation = async (
  runtime: ChatState,
  conversationId: string,
  replayCompletedEvents = false,
) => {
  if (activeSocket && runtime.getStatus() === 'streaming') {
    return;
  }

  const controller = new AbortController();
  probeController = controller;
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
  probeController = null;

  if (
    agentStatus.status !== 'running' &&
    !(replayCompletedEvents && agentStatus.status !== 'idle')
  ) {
    clearReconnectState();
    runtime.setStatus('idle');
    return;
  }

  openEventSocket(runtime, conversationId);
};
