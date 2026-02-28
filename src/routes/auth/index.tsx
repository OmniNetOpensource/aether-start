import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionStateFn } from '@/server/functions/auth/session-state'

export const Route = createFileRoute('/auth/')({
  beforeLoad: async ({ search }) => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' })
    }

    const params = new URLSearchParams()
    const s = search as Record<string, string | undefined>
    if (s.redirect) params.set('redirect', s.redirect)
    if (s.email) params.set('email', s.email)
    if (s.reset) params.set('reset', s.reset)

    const qs = params.toString()
    throw redirect({ href: `/auth/login${qs ? `?${qs}` : ''}` })
  },
})
