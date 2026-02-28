import { Outlet, createFileRoute, redirect, useMatch } from '@tanstack/react-router'
import Sidebar from '@/components/sidebar/Sidebar'
import { getSessionStateFn } from '@/server/functions/auth/session-state'
import { ChatRoom } from '@/routes/app/components/-ChatRoom'

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ location }) => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      return
    }

    const target = `${location.pathname}${location.search}${location.hash}`
    throw redirect({
      href: `/auth/login?redirect=${encodeURIComponent(target)}`,
    })
  },
  component: AppLayout,
})

function AppLayout() {
  const isNotesRoute = !!useMatch({ from: '/app/notes', shouldThrow: false })
  const isLeaderboardRoute = !!useMatch({ from: '/app/leaderboard', shouldThrow: false })
  const useStandaloneLayout = isNotesRoute || isLeaderboardRoute

  return (
    <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar />
      <div className='relative z-0 flex-1 min-w-0 flex'>
        {useStandaloneLayout ? (
          <Outlet />
        ) : (
          <ChatRoom>
            <Outlet />
          </ChatRoom>
        )}
      </div>
    </div>
  )
}
