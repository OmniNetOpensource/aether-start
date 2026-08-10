import type { AskUserQuestionsAnswer } from '@/shared/chat/ask-user-questions';
import type { ChatCommandResponse, Operation } from '@/shared/chat/chat-api';
import type { ChatState } from './chat-state';
import {
  hasActiveEventSubscription,
  openEventSubscription,
  resolveAgentBaseUrl,
  resumeRunningConversation,
  scheduleAutoReconnect,
} from './chat-subscription';
import { applyChatEventToTree, resetLastEventId } from './event-handlers';

const SELECT_MODEL_WARNING = 'Select a model before sending a message.';

const generateId = (prefix = 'id') =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

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
  const idempotencyKey = generateId('msg');

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

  const ownsSubscription = !hasActiveEventSubscription();
  if (ownsSubscription) {
    resetLastEventId();
    runtime.setStatus('sending');
  }
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
    runtime.messageTree.applyChatAccepted(
      acceptedPayload.userMessage,
      acceptedPayload.assistantMessage,
    );
    runtime.messageTree.markAssistantStreaming(acceptedPayload.assistantMessage.id);
    acceptedAssistantMessageId = acceptedPayload.assistantMessage.id;
    onAccepted?.(acceptedPayload);
    runtime.setStatus('streaming');

    if (ownsSubscription && !hasActiveEventSubscription()) {
      openEventSubscription(runtime, acceptedPayload.conversationId);
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
      if (!hasActiveEventSubscription()) {
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
