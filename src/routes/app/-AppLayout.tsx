import { lazy, Suspense, useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';
import { ArtifactToggleButton } from '@/features/chat/artifact';
import { Composer } from '@/features/chat/composer/Composer';
import { MessageList } from '@/features/chat/message-thread/MessageList';
import Sidebar from '@/features/conversations/conversation-list';
import { NewChatButton } from '@/features/conversations/conversation-list/NewChatButton';
import { AppShellRouteDataProvider } from '@/features/conversations/route-data';
import { useChatSessionStore } from '@/features/conversations/session';
import { ShareButton } from '@/features/share/share-dialog';
import { loadWithRetry } from '@/shared/browser/load-with-retry';
import { Route } from '@/routes/app/route';

const ArtifactPanel = lazy(() =>
  loadWithRetry(() => import('@/features/chat/artifact/ArtifactPanel')),
);

export default function AppLayout() {
  const loaderData = Route.useLoaderData();
  const pageTitle = useChatSessionStore((state) => state.pageTitle);
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <AppShellRouteDataProvider value={loaderData}>
      <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
        <Sidebar />
        <div className='relative flex-1 z-0 min-w-0 flex flex-col gap-2 min-h-0'>
          <div className='flex shrink-0 h-16 items-center gap-3 px-4 bg-transparent'>
            <div className='flex-1' />
            <ArtifactToggleButton />
            <ShareButton />
            <NewChatButton variant='topbar' className='rounded-lg' />
          </div>
          <main className='relative flex flex-row flex-1 min-h-0 min-w-0'>
            <div className='@container relative h-full flex-1 min-w-0'>
              <MessageList />
              <Outlet />
              <Composer />
            </div>
            <Suspense>
              <ArtifactPanel />
            </Suspense>
          </main>
        </div>
      </div>
    </AppShellRouteDataProvider>
  );
}
