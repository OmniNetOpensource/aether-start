import { createFileRoute } from '@tanstack/react-router';
import { MessageList } from '@/features/chat/components/message/MessageList';
import { useConversationLoader } from '@/features/sidebar/useConversationLoader';

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  useConversationLoader(conversationId);

  return <MessageList className='flex-1 min-h-0' />;
}
