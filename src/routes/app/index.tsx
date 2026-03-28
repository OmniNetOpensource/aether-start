import { createFileRoute } from '@tanstack/react-router';
import { MessageList } from '@/features/chat/message-thread';
import { useChatRequestStore } from '@/features/chat/session';
import { useEditingStore } from '@/features/chat/message-thread';
import { useChatSessionStore } from '@/features/conversations/session';

function initNewChatPage() {
  if (typeof window === 'undefined') return;

  useChatRequestStore.getState().setStatus('idle', 'new_chat/enter');
  useEditingStore.getState().clear();
  useChatSessionStore.getState().clearSession();
}

export const Route = createFileRoute('/app/')({
  beforeLoad: initNewChatPage,
  component: HomePage,
});

function HomePage() {
  return <MessageList />;
}
