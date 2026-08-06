import { createFileRoute } from '@tanstack/solid-router';
import { onSettled } from 'solid-js';
import {
  cancelStreamSubscription,
  resetLastEventId,
} from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import { artifacts, clearArtifacts } from '@/frontend/chat/artifact/artifact-state';
import { NewChatGreeting } from '@/frontend/chat/message-thread/NewChatGreeting';
import {
  clearConversationMeta,
  conversationId,
} from '@/frontend/conversations/session/conversation-meta';
import {
  clearMessageTree,
  messages,
} from '@/frontend/conversations/conversation-tree/message-tree-state';

export const Route = createFileRoute('/app/')({
  component: NewChatPage,
});

function NewChatPage() {
  onSettled(() => {
    if (conversationId() === null && messages().length === 0 && artifacts().length === 0) return;

    cancelStreamSubscription(chatState, 'conversation/new');
    resetLastEventId();
    clearConversationMeta();
    clearMessageTree();
    clearArtifacts();
  });

  return <NewChatGreeting />;
}
