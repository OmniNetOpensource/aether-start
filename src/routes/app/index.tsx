import { createFileRoute } from '@tanstack/solid-router';
import { Show, onSettled } from 'solid-js';
import { cancelStreamSubscription } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { resetLastEventId } from '@/frontend/chat/agent-runtime/event-handlers';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import { artifacts, clearArtifacts } from '@/frontend/chat/artifact/artifact-state';
import { MessageList } from '@/frontend/chat/message-thread/MessageList';
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

  /* 新会话发出第一条消息后，消息已进树但路由还没跳到 /app/:id，
     先渲染 MessageList 避免跳转前出现空白 */
  return (
    <Show when={messages().length > 0} fallback={<NewChatGreeting />}>
      <MessageList />
    </Show>
  );
}
