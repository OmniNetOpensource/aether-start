import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  type ParsedLocation,
} from '@tanstack/react-router';
import Sidebar from '@/components/sidebar/Sidebar';
import { getSessionStateFn } from '@/server/functions/auth/session-state';
import { NewChatButton } from '@/features/chat/components/NewChatButton';
import { ArtifactToggleButton } from '@/features/chat/components/artifact/ArtifactToggleButton';
import { ShareButton } from '@/features/share/components/ShareButton';

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
  component: AppLayout,
});

function AppLayout() {
  const { pathname } = useLocation();
  const isNotes = pathname === '/app/notes';

  return (
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
  );
}
