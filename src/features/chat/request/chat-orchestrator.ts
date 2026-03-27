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
 * 与 chat-agent 服务端配合，通过 SSE 接收 chat_event、chat_started、chat_finished 等事件，
 * 并调用 event-handlers 中的 applyChatEventToTree 更新 UI 状态。
 */
import { toast } from '@/shared/useToast';
import { applyChatEventToTree } from './event-handlers';
import { useChatRequestStore } from './useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import type { SerializedMessage } from '@/features/chat/types/message';
import type { ChatAgentStatus, MessageTreeSnapshot } from '@/features/chat/types/chat-api';
import type { ChatServerToClientEvent } from '@/features/chat/types/chat-event-types';

/** Agent 路由名，对应 /agents/chat-agent */
const AGENT_NAME = 'chat-agent';
/** 对话已在生成回复时的提示文案 */
const BUSY_WARNING = 'This conversation is already generating a response.';
/** 未选择角色时的提示文案 */
const SELECT_MODEL_WARNING = 'Select a model before sending a message.';
/** 配额超限时的默认提示文案 */
const QUOTA_EXCEEDED_MESSAGE = 'Quota exceeded.';

/**
 * 已处理的最大 eventId，用于去重和断点续传。
 * 服务端事件带 eventId，客户端只处理 eventId > lastEventId 的事件。
 */
let lastEventId = 0;

/** 重置 lastEventId，每次新请求前调用，避免沿用旧会话的 eventId */
export const resetLastEventId = () => {
  lastEventId = 0;
};

/**
 * 当前活跃的 AbortController。
 * 同一时刻只允许一个请求在跑，新请求会 abort 掉旧的。
 */
let activeController: AbortController | null = null;

let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectConversationId: string | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
/** 退避序列: 1s, 2s, 4s, 8s, 16s */
const BASE_RECONNECT_DELAY = 1000;

const clearReconnectState = () => {
  reconnectAttempt = 0;
  reconnectConversationId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleAutoReconnect = (conversationId: string) => {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    clearReconnectState();
    toast.error('连接已断开');
    useChatRequestStore.getState().setStatus('idle', 'reconnect/maxAttempts');
    return;
  }

  reconnectConversationId = conversationId;
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt);
  reconnectAttempt++;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    const currentId = useChatSessionStore.getState().conversationId;
    if (currentId !== conversationId || reconnectConversationId !== conversationId) {
      clearReconnectState();
      return;
    }

    toast.info('重新连接中...');
    await resumeRunningConversation(conversationId);
  }, delay);
};

/**
 * 解析 Agent 的 base URL。
 * 根据当前页面的 protocol 和 host 拼接，SSR 时回退到 localhost:3000。
 */
const resolveAgentBaseUrl = () => {
  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
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

/**
 * 流结束后的收尾逻辑。
 * 异常结束时尝试自动重连；正常 idle 或无法重连时清理重连状态。
 */
const finalizeStream = () => {
  if (useChatRequestStore.getState().status !== 'idle') {
    const conversationId = useChatSessionStore.getState().conversationId;
    if (conversationId) {
      scheduleAutoReconnect(conversationId);
      return;
    }
    useChatRequestStore.getState().setStatus('idle', 'finalizeStream');
  }
  clearReconnectState();
};

/**
 * 处理单条 SSE 消息。
 * @param event - SSE 的 event 字段（如 chat_event、chat_started、chat_finished 等）
 * @param raw - data 字段的原始 JSON 字符串
 */
const handleSSEMessage = (event: string, raw: string) => {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const { setStatus } = useChatRequestStore.getState();

  switch (event) {
    case 'chat_event': {
      /* 单条聊天事件：需带 eventId 且大于 lastEventId 才处理，避免重复 */
      if (typeof payload.eventId !== 'number') return;
      if (payload.eventId <= lastEventId) return;
      lastEventId = payload.eventId;

      applyChatEventToTree(payload.event as ChatServerToClientEvent);
      return;
    }
    case 'chat_started':
      setStatus('streaming', 'chat_started');
      return;
    case 'chat_finished':
      clearReconnectState();
      setStatus('idle', 'chat_finished');
      return;
    case 'sync_response': {
      /* 断点续传：服务端返回已有事件列表，按 eventId 去重后依次应用 */
      setStatus(payload.status === 'running' ? 'streaming' : 'idle', 'sync_response');
      if (Array.isArray(payload.events)) {
        for (const item of payload.events) {
          const record = item as Record<string, unknown>;
          if (typeof record.eventId === 'number' && record.eventId > lastEventId) {
            lastEventId = record.eventId;
            applyChatEventToTree(record.event as ChatServerToClientEvent);
          }
        }
      }
      return;
    }
    case 'busy':
      toast.warning(BUSY_WARNING);
      setStatus('streaming', 'busy');
      return;
    case 'conversation_update':
      /* 对话元数据更新（如标题），转为 conversation_updated 事件应用 */
      if (
        typeof payload.conversationId === 'string' &&
        typeof payload.title === 'string' &&
        typeof payload.updated_at === 'string'
      ) {
        applyChatEventToTree({
          type: 'conversation_updated',
          conversationId: payload.conversationId,
          title: payload.title,
          updated_at: payload.updated_at,
        });
      }
      return;
  }
};

/**
 * 消费 SSE 流式响应。
 * 按 \n\n 分割事件块，解析 event: 和 data: 行，调用 handleSSEMessage 处理。
 * 支持 signal 中断；结束时调用 reader.cancel 释放资源。
 */
const consumeStreamResponse = async (response: Response) => {
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
        handleSSEMessage(event, dataLines.join('\n'));
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
    reader.cancel().catch(() => {});
  }
};

/**
 * 探测指定对话的 Agent 状态。
 * GET /agents/chat-agent/:conversationId，返回 idle | running | completed | aborted | error。
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
 * 2. 若无 conversationId，创建新对话并导航到 /app/c/:id
 * 3. 构建 body（idempotencyKey、model、promptId、conversationHistory、treeSnapshot）
 * 4. 取消之前的请求，发起 POST /agents/chat-agent/:conversationId/chat
 * 5. 处理 409（busy）、402（配额超限）
 * 6. 消费 SSE 流，结束时 finalizeStream
 *
 * 异常：AbortError 静默忽略；TypeError（如网络错误）调用 finalizeStream；其他恢复 idle。
 */
export const startChatRequest = async () => {
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  if (requestStore.status !== 'idle') return;

  resetLastEventId();

  if (!sessionStore.currentModelId) {
    toast.warning(SELECT_MODEL_WARNING);
    return;
  }

  const messages = sessionStore.getMessagesFromPath();
  const conversationId = sessionStore.conversationId;
  const idempotencyKey = generateId('msg'); /* 幂等键，防止重复提交 */

  /* 消息树快照，供服务端做分支/上下文对齐 */
  const treeSnapshot: MessageTreeSnapshot = useChatSessionStore.getState().getTreeState();

  const body = {
    idempotencyKey,
    model: sessionStore.currentModelId,
    promptId: sessionStore.currentPromptId || undefined,
    conversationId,
    conversationHistory: messages.map(
      (message) =>
        ({
          role: message.role,
          blocks: message.blocks,
        }) as SerializedMessage,
    ),
    treeSnapshot,
  };

  activeController?.abort(); /* 取消之前的请求，保证同一时刻只有一个在跑 */
  activeController = new AbortController();
  requestStore.setStatus('sending', 'startChatRequest');

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal: activeController.signal,
    });

    if (response.status === 409) {
      /* 服务端已有该对话的活跃流，视为 busy */
      await response.json().catch(() => ({}));
      toast.warning(BUSY_WARNING);
      useChatRequestStore.getState().setStatus('streaming', 'startChatRequest/409_busy');
      return;
    }

    if (response.status === 402) {
      /* 配额超限，写入 error 事件并恢复 idle */
      const data = (await response.json()) as Record<string, unknown>;
      applyChatEventToTree({
        type: 'error',
        message: typeof data.message === 'string' ? data.message : QUOTA_EXCEEDED_MESSAGE,
      });
      useChatRequestStore.getState().setStatus('idle', 'startChatRequest/402_quota');
      return;
    }

    await consumeStreamResponse(response);
    finalizeStream();
  } catch (error) {
    if (isAbortError(error)) return;

    const currentStatus = useChatRequestStore.getState().status;
    const convId = useChatSessionStore.getState().conversationId;

    if (error instanceof TypeError && currentStatus === 'streaming' && convId) {
      scheduleAutoReconnect(convId);
      return;
    }

    useChatRequestStore.getState().setStatus('idle', 'startChatRequest/error');
    toast.error(
      error instanceof TypeError ? '连接中断' : error instanceof Error ? error.message : '请求失败',
    );
  } finally {
    activeController = null;
  }
};

/**
 * 取消订阅流式输出。
 * abort 本地 activeController，将 status 设为 idle。
 */
export const cancelStreamSubscription = () => {
  clearReconnectState();
  activeController?.abort();
  activeController = null;

  useChatRequestStore.getState().setStatus('idle', 'cancelStreamSubscription');
};

/**
 * 取消正在进行的 AI 回复。
 * 集成 cancelStreamSubscription 与 POST /abort 通知服务端。
 */
export const cancelAnswering = () => {
  cancelStreamSubscription();
  const conversationId = useChatSessionStore.getState().conversationId;
  if (conversationId) {
    fetch(`${resolveAgentBaseUrl()}/${conversationId}/abort`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
  }
};

/**
 * 恢复正在进行的对话流（如页面刷新后重新进入对话页）。
 *
 * 流程：
 * 1. 调用 checkAgentStatus，若不为 running 则直接设为 idle 返回
 * 2. 创建新 AbortController，通过 activeController 与 cancelStreamSubscription 联动
 * 3. POST /agents/chat-agent/:conversationId/events，body 为 { lastEventId }
 * 4. 消费返回的 SSE 流（sync_response + 后续 chat_event）
 * 5. 结束时 finalizeStream
 *
 * 取消方式：useConversationLoader 切换/离开对话时调用 cancelStreamSubscription 即可 abort
 */
export const resumeRunningConversation = async (conversationId: string) => {
  let agentStatus: { status: ChatAgentStatus };

  try {
    agentStatus = await checkAgentStatus(conversationId);
  } catch {
    if (reconnectConversationId === conversationId) {
      scheduleAutoReconnect(conversationId);
    }
    return;
  }

  if (agentStatus.status !== 'running') {
    clearReconnectState();
    if (useChatRequestStore.getState().status !== 'idle') {
      useChatRequestStore.getState().setStatus('idle', 'resumeRunningConversation/agentDone');
    }
    return;
  }

  const controller = new AbortController();
  activeController = controller;

  useChatRequestStore.getState().setStatus('sending', 'resumeRunningConversation');

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastEventId }),
      signal: controller.signal,
    });

    await consumeStreamResponse(response);

    if (useChatRequestStore.getState().status === 'idle') {
      clearReconnectState();
      return;
    }

    finalizeStream();
  } catch (error) {
    if (isAbortError(error)) return;

    if (error instanceof TypeError && reconnectConversationId === conversationId) {
      scheduleAutoReconnect(conversationId);
      return;
    }

    useChatRequestStore.getState().setStatus('idle', 'resumeRunningConversation/error');
    toast.error(
      error instanceof TypeError ? '连接中断' : error instanceof Error ? error.message : '请求失败',
    );
  } finally {
    if (activeController === controller) {
      activeController = null;
    }
  }
};
