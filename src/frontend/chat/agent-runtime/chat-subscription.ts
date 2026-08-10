import { setQueuedMessages } from '@/frontend/chat/composer/composer-request/message-queue';
import type { ChatAgentStatus } from '@/shared/chat/chat-api';
import type { ChatState } from './chat-state';
import {
  flushStreamBuffer,
  getLastEventId,
  handleServerMessage,
  parseServerMessage,
} from './event-handlers';

const AGENT_NAME = 'conversation-runner';
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

let activeSocket: WebSocket | null = null;
let probeController: AbortController | null = null;
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

const resolveAgentSocketUrl = (conversationId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/agents/${AGENT_NAME}/${conversationId}/events`;
};

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError');

export const openEventSubscription = (runtime: ChatState, conversationId: string) => {
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

export const resolveAgentBaseUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.host}/agents/${AGENT_NAME}`;
};

export const hasActiveEventSubscription = () => activeSocket !== null;

export const scheduleAutoReconnect = (runtime: ChatState, conversationId: string) => {
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
  probeController?.abort();
  probeController = null;
  const socket = activeSocket;
  activeSocket = null;
  socket?.close();
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

  openEventSubscription(runtime, conversationId);
};
