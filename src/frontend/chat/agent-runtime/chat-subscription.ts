import { setQueuedMessages } from '@/frontend/chat/composer/composer-request/message-queue';
import { setArtifacts } from '@/frontend/chat/artifact/artifact-state';
import {
  getConversationFn,
  setCurrentModelId,
  setPageTitle,
} from '@/frontend/conversations/session';
import { initializeMessageTree } from '@/frontend/conversations/conversation-tree/message-tree-state';
import { buildPathToLatestAssistant } from '@/shared/conversations';
import { isMessage } from '@/shared/chat/message';
import type { ChatAgentStatus } from '@/shared/chat/chat-api';
import type { ChatState } from './chat-state';
import {
  flushStreamBuffer,
  getLastEventId,
  handleServerMessage,
  parseServerMessage,
  resetLastEventId,
} from './event-handlers';

const AGENT_NAME = 'conversation-runner';
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

let activeSubscription: AbortController | null = null;
let stopFinished: { promise: Promise<void>; resolve: () => void } | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectConversationId: string | null = null;

const waitForStopFinished = () => {
  if (!stopFinished) {
    let resolve = () => {};
    const promise = new Promise<void>((complete) => {
      resolve = complete;
    });
    stopFinished = { promise, resolve };
  }
  return stopFinished.promise;
};

const resolveStopFinished = () => {
  stopFinished?.resolve();
  stopFinished = null;
};

const clearReconnectState = () => {
  reconnectAttempt = 0;
  reconnectConversationId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const recoverConversationSnapshot = async (
  runtime: ChatState,
  conversationId: string,
  isRunning: boolean,
) => {
  const conversation = await getConversationFn({ data: { id: conversationId } });
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const messages = conversation.messages.filter(isMessage);
  if (messages.length !== conversation.messages.length) {
    throw new Error('Invalid persisted message tree');
  }

  if (runtime.getConversationId() !== conversationId) return;

  initializeMessageTree(messages, buildPathToLatestAssistant(messages));
  setArtifacts(conversation.artifacts);
  setPageTitle(conversation.title ?? 'Aether');
  setCurrentModelId(conversation.model ?? '');
  resetLastEventId(conversationId);
  if (!isRunning) {
    runtime.messageTree.clearStreamingAssistants();
  }
  runtime.setStatus(isRunning ? 'streaming' : 'idle');
};

const reportSnapshotRecoveryFailure = (
  runtime: ChatState,
  conversationId: string,
  error: unknown,
) => {
  if (runtime.getConversationId() !== conversationId) return;
  console.error('Failed to recover conversation snapshot:', error);
  runtime.messageTree.clearStreamingAssistants();
  runtime.setStatus('idle');
  runtime.toast.error(error instanceof Error ? error.message : '会话恢复失败');
};

export const resolveAgentBaseUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.host}/agents/${AGENT_NAME}`;
};

export const openEventSubscription = async (runtime: ChatState, conversationId: string) => {
  if (activeSubscription) return;

  const controller = new AbortController();
  activeSubscription = controller;

  try {
    const response = await fetch(`${resolveAgentBaseUrl()}/${conversationId}/events`, {
      headers: {
        Accept: 'text/event-stream',
        'Last-Event-ID': String(getLastEventId(conversationId)),
      },
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Event subscription failed: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Event subscription response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        if (!frame.startsWith('data: ')) continue;

        const message = parseServerMessage(frame.slice('data: '.length));
        if (!message) continue;

        const recoveryRequired = handleServerMessage(runtime, message, conversationId);
        if (message.event !== 'sync_response') continue;

        clearReconnectState();
        if (!recoveryRequired) continue;

        void recoverConversationSnapshot(
          runtime,
          conversationId,
          message.data.status === 'running',
        ).catch((error) => reportSnapshotRecoveryFailure(runtime, conversationId, error));
      }
    }
  } catch (error) {
    if (activeSubscription !== controller || controller.signal.aborted) return;
    console.error('[SSE] Event subscription failed:', error);
  } finally {
    flushStreamBuffer();

    if (activeSubscription === controller) {
      activeSubscription = null;

      if (!controller.signal.aborted) {
        if (runtime.getStatus() !== 'idle') {
          scheduleAutoReconnect(runtime, conversationId);
        } else {
          clearReconnectState();
          resolveStopFinished();
        }
      }
    }
  }
};

export const hasActiveEventSubscription = () => activeSubscription !== null;

export const restartEventSubscription = (runtime: ChatState, conversationId: string) => {
  const controller = activeSubscription;
  activeSubscription = null;
  controller?.abort();
  void openEventSubscription(runtime, conversationId);
};

export const scheduleAutoReconnect = (runtime: ChatState, conversationId: string) => {
  if (reconnectTimer && reconnectConversationId === conversationId) {
    return;
  }

  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    clearReconnectState();
    runtime.toast.error('连接已断开，正在恢复最近一次保存的会话');
    void recoverConversationSnapshot(runtime, conversationId, false).catch((error) =>
      reportSnapshotRecoveryFailure(runtime, conversationId, error),
    );
    return;
  }

  reconnectConversationId = conversationId;
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt);
  reconnectAttempt++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    const currentId = runtime.getConversationId();
    if (currentId !== conversationId || reconnectConversationId !== conversationId) {
      clearReconnectState();
      return;
    }

    runtime.toast.info('重新连接中...');
    resumeRunningConversation(runtime, conversationId);
  }, delay);
};

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

export const cancelSending = async (runtime: ChatState, reason: string) => {
  if (runtime.getStatus() !== 'sending') {
    return;
  }
  cancelStreamSubscription(runtime, reason);
};

export const cancelStreamSubscription = (runtime: ChatState, _reason: string) => {
  clearReconnectState();
  flushStreamBuffer();
  const controller = activeSubscription;
  activeSubscription = null;
  controller?.abort();
  resolveStopFinished();
  setQueuedMessages([]);
  runtime.messageTree.clearStreamingAssistants();
  runtime.setStatus('idle');
};

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

export const resumeRunningConversation = (runtime: ChatState, conversationId: string) => {
  if (activeSubscription) return;

  runtime.setStatus('sending');
  void openEventSubscription(runtime, conversationId);
};
