import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Suspense, lazy, useEffect } from 'react';
import {
  resetLastEventId,
  cancelStreamSubscription,
  resumeRunningConversation,
} from '@/features/chat/session';
import { FallbackMessageList } from '@/features/chat/message-thread/FallbackMessageList';
import { useEditingStore } from '@/features/chat/message-thread/useEditingStore';
import type { Message } from '@/features/chat/message-thread/message';
import { useChatSessionStore } from '@/features/conversations/session';
import { getConversationFn } from '@/features/conversations/session';
import { buildCurrentPath } from '@/features/conversations/conversation-tree';
import { loadWithRetry } from '@/shared/browser/load-with-retry';

const MessageList = lazy(() =>
  loadWithRetry(() =>
    import('@/features/chat/message-thread/MessageList').then((m) => ({ default: m.MessageList })),
  ),
);

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();
  const currentConversationId = useChatSessionStore((state) => state.conversationId);
  const initializeTree = useChatSessionStore((state) => state.initializeTree);
  const setConversationId = useChatSessionStore((state) => state.setConversationId);
  const setArtifacts = useChatSessionStore((state) => state.setArtifacts);
  const setPageTitle = useChatSessionStore((state) => state.setPageTitle);

  useEffect(() => {
    if (currentConversationId === conversationId) return;
    let cancelled = false;

    void getConversationFn({ data: { id: conversationId } })
      .then((conversation) => {
        if (cancelled) return;

        if (!conversation) {
          navigate({ to: '/404', replace: true });
          return;
        }

        const messages = (conversation.messages ?? []) as Message[];
        let currentPath = conversation.currentPath ?? [];
        if (currentPath.length === 0 && messages.length > 0) {
          currentPath = buildCurrentPath(messages, messages[0].id);
        }

        setConversationId(conversationId);
        initializeTree(messages, currentPath);
        setArtifacts(conversation.artifacts ?? []);
        setPageTitle(conversation.title ?? 'Aether');
        const store = useChatSessionStore.getState();
        const modelId = conversation.model ?? '';
        store.setCurrentModel(modelId);
        void resumeRunningConversation(conversationId);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load conversation:', error);
        navigate({ to: '/404', replace: true });
      });

    return () => {
      resetLastEventId();
      cancelStreamSubscription('conversation-page/cleanup');
      useEditingStore.getState().clear();
      cancelled = true;
    };
  }, [
    conversationId,
    currentConversationId,
    navigate,
    initializeTree,
    setConversationId,
    setArtifacts,
    setPageTitle,
  ]);

  return (
    <Suspense fallback={<FallbackMessageList />}>
      <MessageList />
    </Suspense>
  );
}
