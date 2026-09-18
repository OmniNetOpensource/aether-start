import { useEffect, useLayoutEffect } from 'react';
import { Link, Outlet, createFileRoute } from '@tanstack/react-router';
import { cancelStreamSubscription } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { chatState, registerChatToast } from '@/frontend/chat/agent-runtime/chat-state';
import { Composer } from '@/frontend/chat/composer/Composer';
import Sidebar from '@/frontend/conversations/conversation-list';
import { Pencil } from '@/frontend/design-system/icons';
import { buttonVariants } from '@/frontend/design-system/button';
import { cn } from '@/shared/core/utils';
import {
  availableModelsQueryOptions,
  conversationInfiniteQueryOptions,
  usePageTitle,
} from '@/frontend/conversations/session';
import { ShareButton } from '@/frontend/share/share-dialog';
import { useToast } from '@/frontend/app-shell/useToast';

export const Route = createFileRoute('/app')({
  loader: async ({ context }) => {
    const { queryClient } = context;
    const [availableModels] = await Promise.all([
      queryClient.ensureQueryData(availableModelsQueryOptions),
      queryClient.prefetchInfiniteQuery({
        ...conversationInfiniteQueryOptions,
        staleTime: Infinity,
      }),
    ]);

    return { availableModels };
  },
  onLeave: () => {
    cancelStreamSubscription(chatState, 'app/unmount');
  },
  component: AppLayout,
});

function AppLayout() {
  const toast = useToast();
  const pageTitle = usePageTitle();

  useLayoutEffect(() => {
    registerChatToast(toast);
  }, [toast]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar />
      <div className='relative flex-1 z-0 min-w-0 flex flex-col gap-2 min-h-0'>
        <div className='flex shrink-0 h-16 items-center gap-3 px-4 bg-transparent'>
          <div className='flex-1' />
          <ShareButton />
          <Link
            to='/app'
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-lg' }),
              'group relative h-10 w-10 overflow-hidden rounded-lg transition-all duration-300 hover:bg-hover hover:text-foreground',
            )}
            aria-label='新对话'
          >
            <span className='flex h-10 w-10 shrink-0 items-center justify-center'>
              <Pencil className='h-5 w-5 transition-transform duration-300 group-hover:rotate-90' />
            </span>
            <span className='sr-only'>新对话</span>
          </Link>
        </div>
        <main className='relative flex flex-1 min-h-0 min-w-0'>
          <div className='@container relative h-full flex-1 min-w-0'>
            <Outlet />
            <Composer />
          </div>
        </main>
      </div>
    </div>
  );
}
