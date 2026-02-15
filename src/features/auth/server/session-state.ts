import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getSessionFromRequest } from '@/features/auth/server/session'

export const getSessionStateFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionFromRequest(getRequest())

  return {
    isAuthenticated: !!session,
    user: session
      ? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        }
      : null,
  }
})
