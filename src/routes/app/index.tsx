import { createFileRoute } from '@tanstack/react-router';
import { MessageList } from '@/components/chat/message/MessageList';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useEditingStore } from '@/features/chat/editing/useEditingStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';

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
  const messages = useChatSessionStore((state) => state.messages);
  const hasMessages = messages.length > 0;

  if (!hasMessages) {
    return null;
  }

  return <MessageList className='flex-1 min-h-0' />;
}
