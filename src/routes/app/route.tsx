import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
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
      href: `/auth?redirect=${encodeURIComponent(target)}`,
    })
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar />
      <div className='relative flex-1 min-w-0 flex'>
        <ChatRoom>
          <Outlet />
        </ChatRoom>
      </div>
    </div>
  )
}
