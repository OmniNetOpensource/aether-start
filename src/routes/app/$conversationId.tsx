import { createFileRoute, redirect, useHydrated } from '@tanstack/solid-router';
import { createEffect, untrack } from 'solid-js';
import {
  cancelStreamSubscription,
  resetLastEventId,
  resumeRunningConversation,
} from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatRuntime } from '@/frontend/chat/agent-runtime/chat-runtime';
import { setArtifacts } from '@/frontend/chat/artifact/artifact-state';
import { isMessage } from '@/shared/chat/message';
import { MessageList } from '@/frontend/chat/message-thread/MessageList';
import { buildCurrentPath } from '@/shared/conversations';
import {
  cacheConversation,
  type ConversationDetail,
  conversationId,
  getConversationFromCache,
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

    const cachedConversation = getConversationFromCache(params.conversationId);
    const conversation =
      cachedConversation ?? (await getConversationFn({ data: { id: params.conversationId } }));
    if (!conversation) throw redirect({ href: '/404' });

    const messages = conversation.messages.flatMap((message) =>
      isMessage(message) ? [message] : [],
    );
    if (messages.length !== conversation.messages.length) {
      throw new Error('Invalid persisted message tree');
    }
    const detail: ConversationDetail = { ...conversation, messages };
    cacheConversation(detail);
    return { conversation: detail };
  },
  component: ConversationPage,
});

function ConversationPage() {
  const loaderData = Route.useLoaderData();
  const hydrated = useHydrated();

  createEffect(
    () => ({ conversation: loaderData().conversation, hydrated: hydrated() }),
    ({ conversation, hydrated: isHydrated }) => {
      if (!isHydrated || !conversation) return;
      queueMicrotask(() => {
        cacheConversation(conversation);
        if (untrack(conversationId) === conversation.id) return;

        cancelStreamSubscription(chatRuntime, 'conversation/change');
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
        void resumeRunningConversation(chatRuntime, conversation.id);
      });
    },
  );

  return <MessageList />;
}
