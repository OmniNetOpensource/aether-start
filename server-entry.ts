import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { routeAgentRequest } from 'agents'
import { env as workerEnv } from 'cloudflare:workers'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import type { RequestHandler } from '@tanstack/react-start/server'
import type { Register } from '@tanstack/react-router'
import { ChatAgent } from '@/features/chat/api/server/agents/chat-agent'

const startFetch = createStartHandler(defaultStreamHandler)

const fetch: RequestHandler<Register> = async (request, opts) => {
  const agentResponse = await routeAgentRequest(request, workerEnv)
  if (agentResponse) {
    return agentResponse
  }

  return startFetch(request, opts)
}

export { ChatAgent }

export default createServerEntry({
  fetch,
})
