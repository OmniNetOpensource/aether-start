import { Outlet, createFileRoute, redirect, type ParsedLocation } from '@tanstack/react-router'
import Sidebar from '@/components/sidebar/Sidebar'
import { getSessionStateFn } from '@/server/functions/auth/session-state'

export function getNormalizedAppTarget(
  location: Pick<ParsedLocation, 'pathname' | 'searchStr' | 'hash'>,
) {
  const hashSuffix = location.hash ? `#${location.hash}` : ''
  return `${location.pathname}${location.searchStr}${hashSuffix}`
}

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ location }) => {
    const normalizedTarget = getNormalizedAppTarget(location)

    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      return
    }

    throw redirect({
      href: `/auth/login?redirect=${encodeURIComponent(normalizedTarget)}`,
    })
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar />
      <div className='relative z-0 flex-1 min-w-0 flex'>
        <Outlet />
      </div>
    </div>
  )
}
