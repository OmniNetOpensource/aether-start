import { createFileRoute, redirect } from '@tanstack/solid-router';
import { createEffect } from 'solid-js';
import {
  cancelStreamSubscription,
  resumeRunningConversation,
} from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { resetLastEventId } from '@/frontend/chat/agent-runtime/event-handlers';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import { setArtifacts } from '@/frontend/chat/artifact/artifact-state';
import { isMessage } from '@/shared/chat/message';
import { MessageList } from '@/frontend/chat/message-thread/MessageList';
import { buildCurrentPath } from '@/shared/conversations';
import {
  type ConversationDetail,
  conversationId,
  getConversationFn,
  setConversationId,
  setCurrentModelId,
  setPageTitle,
} from '@/frontend/conversations/session';
import { initializeMessageTree } from '@/frontend/conversations/conversation-tree/message-tree-state';

export const Route = createFileRoute('/app/$conversationId')({
  loader: async ({ params }) => {
    /* 发第一条消息后 navigate 过来：store 里已经是这个会话，无需加载 */
    if (conversationId() === params.conversationId) return { conversation: null };

    const conversation = await getConversationFn({ data: { id: params.conversationId } });
    if (!conversation) throw redirect({ href: '/404' });

    const messages = conversation.messages.flatMap((message) =>
      isMessage(message) ? [message] : [],
    );
    if (messages.length !== conversation.messages.length) {
      throw new Error('Invalid persisted message tree');
    }
    const detail: ConversationDetail = { ...conversation, messages };
    return { conversation: detail };
  },
  component: ConversationPage,
});

function ConversationPage() {
  const loaderData = Route.useLoaderData();

  createEffect(
    () => loaderData().conversation,
    (conversation) => {
      if (!conversation) return;
      if (conversationId() === conversation.id) return;

      cancelStreamSubscription(chatState, 'conversation/change');
      resetLastEventId();
      initializeMessageTree(
        conversation.messages,
        conversation.currentPath.length === 0 && conversation.messages.length > 0
          ? buildCurrentPath(conversation.messages, conversation.messages[0].id)
          : conversation.currentPath,
      );
      setArtifacts(conversation.artifacts);
      setPageTitle(conversation.title ?? 'Aether');
      setCurrentModelId(conversation.model ?? '');
      setConversationId(conversation.id);
      void resumeRunningConversation(chatState, conversation.id);
    },
  );

  return <MessageList />;
}
