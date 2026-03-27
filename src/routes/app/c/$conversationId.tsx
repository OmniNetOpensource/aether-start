import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { MessageList } from '@/features/chat/components/message/MessageList';
import {
  resetLastEventId,
  cancelStreamSubscription,
  resumeRunningConversation,
} from '@/features/chat/request/chat-orchestrator';
import { useEditingStore } from '@/features/chat/editing/useEditingStore';
import type { Message } from '@/features/chat/types/message';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { getConversationFn } from '@/features/sidebar/server/conversations';
import { buildCurrentPath } from '@/features/sidebar/tree/message-tree';

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

  return <MessageList className='flex-1 min-h-0' />;
}
