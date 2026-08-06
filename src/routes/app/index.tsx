import { createFileRoute, useHydrated } from '@tanstack/solid-router';
import { createEffect } from 'solid-js';
import {
  cancelStreamSubscription,
  resetLastEventId,
} from '@/features/chat/agent-runtime/chat-orchestrator';
import { chatRuntime } from '@/features/chat/agent-runtime/chat-runtime';
import { artifacts, clearArtifacts } from '@/features/chat/artifact/artifact-state';
import { NewChatGreeting } from '@/features/chat/message-thread/NewChatGreeting';
import {
  clearConversationMeta,
  conversationId,
} from '@/features/conversations/session/conversation-meta';
import {
  clearMessageTree,
  messages,
} from '@/features/conversations/conversation-tree/message-tree-state';

export const Route = createFileRoute('/app/')({
  component: NewChatPage,
});

function NewChatPage() {
  const hydrated = useHydrated();

  createEffect(
    () => hydrated(),
    (isHydrated) => {
      if (!isHydrated) return;
      queueMicrotask(() => {
        if (conversationId() === null && messages().length === 0 && artifacts().length === 0)
          return;

        cancelStreamSubscription(chatRuntime, 'conversation/new');
        resetLastEventId();
        clearConversationMeta();
        clearMessageTree();
        clearArtifacts();
      });
    },
  );

  return <NewChatGreeting />;
}
