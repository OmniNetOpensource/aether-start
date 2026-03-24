import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  type ParsedLocation,
} from '@tanstack/react-router';
import Sidebar from '@/components/sidebar/Sidebar';
import { getSessionStateFn } from '@/server/functions/auth/session-state';
import { getAvailableModelsFn, getAvailablePromptsFn } from '@/server/functions/chat/models';
import { listConversationsPageFn } from '@/server/functions/conversations';
import { NewChatButton } from '@/features/chat/components/NewChatButton';
import { ArtifactToggleButton } from '@/features/chat/components/artifact/ArtifactToggleButton';
import { ShareButton } from '@/features/share/components/ShareButton';
import {
  AppShellRouteDataProvider,
  type AppShellRouteData,
} from '@/features/sidebar/app-shell-route-data';
import type { ConversationMeta } from '@/types/conversation';

const APP_SHELL_CONVERSATION_PAGE_SIZE = 10;

const toConversationMeta = (detail: {
  id: string;
  user_id?: string;
  title: string | null;
  role?: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}): ConversationMeta => ({
  id: detail.id,
  title: detail.title,
  role: detail.role,
  is_pinned: detail.is_pinned,
  pinned_at: detail.pinned_at,
  created_at: detail.created_at,
  updated_at: detail.updated_at,
  user_id: detail.user_id,
});

export function getNormalizedAppTarget(
  location: Pick<ParsedLocation, 'pathname' | 'searchStr' | 'hash'>,
) {
  const hashSuffix = location.hash ? `#${location.hash}` : '';
  return `${location.pathname}${location.searchStr}${hashSuffix}`;
}

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ location }) => {
    const normalizedTarget = getNormalizedAppTarget(location);

    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      return;
    }

    throw redirect({
      href: `/auth/login?redirect=${encodeURIComponent(normalizedTarget)}`,
    });
  },
  loader: async (): Promise<AppShellRouteData> => {
    const [availableRoles, availablePrompts, conversationPage] = await Promise.all([
      getAvailableModelsFn(),
      getAvailablePromptsFn(),
      listConversationsPageFn({
        data: {
          limit: APP_SHELL_CONVERSATION_PAGE_SIZE,
          cursor: null,
        },
      }),
    ]);

    return {
      availableRoles,
      availablePrompts,
      initialRoleId: availableRoles[0]?.id ?? '',
      initialPromptId: availablePrompts[0]?.id ?? 'aether',
      initialConversations: conversationPage.items.map(toConversationMeta),
      nextConversationCursor: conversationPage.nextCursor,
    };
  },
  component: AppLayout,
});

function AppLayout() {
  const loaderData = Route.useLoaderData();
  const { pathname } = useLocation();
  const isNotes = pathname === '/app/notes';

  return (
    <AppShellRouteDataProvider value={loaderData}>
      <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
        <Sidebar />
        <div className='relative z-0 flex-1 min-w-0 flex'>
          {isNotes ? (
            <Outlet />
          ) : (
            <div className='flex-1 min-w-0 flex flex-col'>
              <div className='flex h-16 items-center gap-3 px-4 bg-transparent'>
                <div className='flex-1' />
                <ArtifactToggleButton />
                <ShareButton />
                <NewChatButton variant='topbar' className='rounded-lg' />
              </div>
              <div className='flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden'>
                <Outlet />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShellRouteDataProvider>
  );
}
