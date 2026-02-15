import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@/features/auth/server/auth'

type AuthSession = typeof auth.$Infer.Session

const unauthorizedResponse = () =>
  new Response('Unauthorized', {
    status: 401,
  })

export const getSessionFromRequest = async (request: Request) => {
  return auth.api.getSession({
    headers: request.headers,
  })
}

export const requireSessionFromRequest = async (request: Request): Promise<AuthSession> => {
  const session = await getSessionFromRequest(request)
  if (!session) {
    throw unauthorizedResponse()
  }

  return session
}

export const getSession = async () => {
  const headers = getRequestHeaders() as Headers
  return auth.api.getSession({
    headers,
  })
}

export const requireSession = async (): Promise<AuthSession> => {
  const session = await getSession()
  if (!session) {
    throw unauthorizedResponse()
  }

  return session
}
