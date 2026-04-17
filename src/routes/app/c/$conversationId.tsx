import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import {
  resetLastEventId,
  resumeRunningConversation,
} from '@/features/chat/agent-runtime/chat-orchestrator';
import { useEditingStore } from '@/features/chat/message-thread/useEditingStore';
import type { Message } from '@/features/chat/message-thread/message';
import { useChatSessionStore } from '@/features/conversations/session';
import { getConversationFn } from '@/features/conversations/session';
import { buildCurrentPath } from '@/features/conversations/conversation-tree';

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (useChatSessionStore.getState().conversationId === conversationId) return;
    let cancelled = false;

    void (async () => {
      try {
        const conversation = await getConversationFn({ data: { id: conversationId } });
        if (cancelled) return;

        if (!conversation) {
          await navigate({ to: '/404', replace: true });
          return;
        }

        const messages = (conversation.messages ?? []) as Message[];
        let currentPath = conversation.currentPath ?? [];
        if (currentPath.length === 0 && messages.length > 0) {
          currentPath = buildCurrentPath(messages, messages[0].id);
        }

        const store = useChatSessionStore.getState();
        store.setConversationId(conversationId);
        store.initializeTree(messages, currentPath);
        store.setArtifacts(conversation.artifacts ?? []);
        store.setPageTitle(conversation.title ?? 'Aether');
        store.setCurrentModel(conversation.model ?? '');
        void resumeRunningConversation(conversationId);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load conversation:', error);
        await navigate({ to: '/404', replace: true });
      }
    })();

    return () => {
      resetLastEventId();
      useEditingStore.getState().clear();
      cancelled = true;
    };
  }, [conversationId, navigate]);

  return null;
}
