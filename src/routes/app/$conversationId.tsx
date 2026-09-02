import { useLayoutEffect } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  cancelStreamSubscription,
  resumeRunningConversation,
} from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { resetLastEventId } from '@/frontend/chat/agent-runtime/event-handlers';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import { isMessage } from '@/shared/chat/message';
import { MessageList } from '@/frontend/chat/message-thread/MessageList';
import { buildPathToLatestAssistant } from '@/shared/conversations';
import {
  conversationId,
  getConversationFn,
  setConversationId,
  setCurrentModelId,
  setPageTitle,
} from '@/frontend/conversations/session';
import { initializeMessageTree } from '@/frontend/conversations/conversation-tree/message-tree-state';

type ActivatableConversation = {
  id: string;
  title: string | null;
  model?: string | null;
  messages: unknown[];
};

function validateMessages(persistedMessages: unknown[]) {
  const messages = persistedMessages.flatMap((message) => (isMessage(message) ? [message] : []));
  if (messages.length !== persistedMessages.length) {
    throw new Error('Invalid persisted message tree');
  }
  return messages;
}

export const Route = createFileRoute('/app/$conversationId')({
  loader: async ({ params }) => {
    /* 发第一条消息后 navigate 过来：store 里已经是这个会话，无需加载 */
    if (conversationId() === params.conversationId) return { conversation: null };

    const conversation = await getConversationFn({ data: { id: params.conversationId } });
    if (!conversation) throw redirect({ href: '/404' });

    validateMessages(conversation.messages);
    return { conversation };
  },
  component: ConversationPage,
});

function activateConversation(
  conversation: ActivatableConversation | null,
  routeConversationId: string,
) {
  if (!conversation) {
    resumeRunningConversation(chatState, routeConversationId);
    return;
  }

  if (conversationId() === conversation.id) {
    resumeRunningConversation(chatState, conversation.id);
    return;
  }

  cancelStreamSubscription(chatState, 'conversation/change');
  resetLastEventId();
  const messages = validateMessages(conversation.messages);
  initializeMessageTree(messages, buildPathToLatestAssistant(messages));
  setPageTitle(conversation.title ?? 'Aether');
  setCurrentModelId(conversation.model ?? '');
  setConversationId(conversation.id);
  resumeRunningConversation(chatState, conversation.id);
}

function ConversationPage() {
  const { conversation } = Route.useLoaderData();
  const { conversationId: routeConversationId } = Route.useParams();

  useLayoutEffect(() => {
    activateConversation(conversation, routeConversationId);
  }, [conversation, routeConversationId]);

  return <MessageList />;
}
