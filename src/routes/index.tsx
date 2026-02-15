import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionStateFn } from '@/features/auth/server/session-state'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn()
    if (sessionState.isAuthenticated) {
      throw redirect({ to: '/app' })
    }

    throw redirect({ to: '/auth' })
  },
})
