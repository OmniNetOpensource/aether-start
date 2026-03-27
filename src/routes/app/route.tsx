import { lazy, Suspense } from 'react';
import { Outlet, createFileRoute } from '@tanstack/react-router';
import Sidebar from '@/features/sidebar/components/Sidebar';
import { Composer } from '@/features/chat/composer/Composer';
import { getAvailableModelsFn, getAvailablePromptsFn } from '@/features/chat/server/functions/models';
import { NewChatButton } from '@/features/chat/components/NewChatButton';
import { ArtifactToggleButton } from '@/features/chat/components/artifact/ArtifactToggleButton';
import { ShareButton } from '@/features/share/components/ShareButton';
import {
  AppShellRouteDataProvider,
  type AppShellRouteData,
} from '@/features/sidebar/app-shell-route-data';
import { queryClient } from '@/features/sidebar/queries/query-client';
import { conversationInfiniteQueryOptions } from '@/features/sidebar/queries/use-conversations';

const ArtifactPanel = lazy(() => import('@/features/chat/components/artifact/ArtifactPanel'));

export const Route = createFileRoute('/app')({
  loader: async (): Promise<AppShellRouteData> => {
    const [availableModels, availablePrompts] = await Promise.all([
      getAvailableModelsFn(),
      getAvailablePromptsFn(),
      queryClient.prefetchInfiniteQuery(conversationInfiniteQueryOptions),
    ]);

    return {
      availableModels,
      availablePrompts,
      initialModelId: availableModels[0]?.id ?? '',
      initialPromptId: availablePrompts[0]?.id ?? 'aether',
    };
  },
  component: AppLayout,
});

function AppLayout() {
  const loaderData = Route.useLoaderData();

  return (
    <AppShellRouteDataProvider value={loaderData}>
      <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
        <Sidebar />
        <div className='relative z-0 flex-1 min-w-0 flex flex-col'>
          <div className='flex h-16 items-center gap-3 px-4 bg-transparent'>
            <div className='flex-1' />
            <ArtifactToggleButton />
            <ShareButton />
            <NewChatButton variant='topbar' className='rounded-lg' />
          </div>
          <div className='flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden'>
            <main className='relative flex min-h-0 flex-1'>
              <div className='@container relative flex min-h-0 min-w-0 flex-1 flex-col'>
                <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
                  <Outlet />
                </div>
                <Composer />
              </div>
              <Suspense>
                <ArtifactPanel />
              </Suspense>
            </main>
          </div>
        </div>
      </div>
    </AppShellRouteDataProvider>
  );
}
