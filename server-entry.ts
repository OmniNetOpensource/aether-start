import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { routeAgentRequest } from 'agents'
import { env as workerEnv } from 'cloudflare:workers'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import { withSentry } from '@sentry/cloudflare'
import type { RequestHandler } from '@tanstack/react-start/server'
import type { Register } from '@tanstack/react-router'
import { ChatAgent as _ChatAgent } from '@/server/agents/chat-agent'
import { getSessionFromRequest } from '@/server/functions/auth/session'

const startFetch = createStartHandler(defaultStreamHandler)

const isProtectedAgentLobby = (lobby: { party: string; name: string }) =>
  lobby.party === 'chat-agent'

const withInjectedUserIdHeader = (request: Request, userId: string) => {
  const headers = new Headers(request.headers)
  headers.set('x-aether-user-id', userId)

  return new Request(request, { headers })
}

const protectAgentRequest = async (
  request: Request,
  lobby: { party: string; name: string },
) => {
  if (!isProtectedAgentLobby(lobby)) {
    return request
  }

  const session = await getSessionFromRequest(request)
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  return withInjectedUserIdHeader(request, session.user.id)
}

const fetch: RequestHandler<Register> = async (request, opts) => {
  const agentResponse = await routeAgentRequest(request, workerEnv, {
    onBeforeConnect: async (agentRequest, lobby) =>
      protectAgentRequest(agentRequest, lobby),
    onBeforeRequest: async (agentRequest, lobby) =>
      protectAgentRequest(agentRequest, lobby),
  })
  if (agentResponse) {
    return agentResponse
  }

  return startFetch(request, opts)
}

const sentryOptions = (env: Record<string, string>) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
})

export const ChatAgent = _ChatAgent

const serverEntry = createServerEntry({
  fetch,
})

export default withSentry(
  sentryOptions,
  serverEntry as ExportedHandler,
) as typeof serverEntry
