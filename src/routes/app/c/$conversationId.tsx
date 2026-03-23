import { lazy, Suspense, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Composer } from '@/features/chat/composer/Composer';
import { MessageList } from '@/features/chat/components/message/MessageList';
import { useConversationLoader } from '@/features/sidebar/useConversationLoader';

const ArtifactPanel = lazy(() => import('@/features/chat/components/artifact/ArtifactPanel'));

export const Route = createFileRoute('/app/c/$conversationId')({
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { isLoading } = useConversationLoader(conversationId);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return null;
  }

  return (
    <div className='flex h-full w-full flex-col'>
      <main className='relative flex min-h-0 flex-1'>
        <div ref={chatAreaRef} className='@container relative flex min-w-0 flex-1 flex-col'>
          <MessageList />
          <Composer />
        </div>
        <Suspense>
          <ArtifactPanel />
        </Suspense>
      </main>
    </div>
  );
}
