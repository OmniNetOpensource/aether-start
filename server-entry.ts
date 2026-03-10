import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { env as workerEnv } from "cloudflare:workers";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import { withSentry } from "@sentry/cloudflare";
import type { RequestHandler } from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import { ChatAgent as _ChatAgent } from "@/features/chat/server/agents/chat-agent";
import { getSessionFromRequest } from "@/features/auth/server/session";

const startFetch = createStartHandler(defaultStreamHandler);

const AGENT_PATH_PREFIX = "/agents/chat-agent/";

const matchAgentRoute = (url: URL): string | null => {
  if (!url.pathname.startsWith(AGENT_PATH_PREFIX)) {
    return null;
  }

  const name = url.pathname.slice(AGENT_PATH_PREFIX.length).split("/")[0];
  return name || null;
};

const routeToAgent = (
  request: Request,
  env: { ChatAgent: DurableObjectNamespace<_ChatAgent> },
  name: string,
) => {
  const id = env.ChatAgent.idFromName(name);
  const stub = env.ChatAgent.get(id);
  return stub.fetch(request);
};

const withInjectedUserIdHeader = (request: Request, userId: string) => {
  const headers = new Headers(request.headers);
  headers.set("x-aether-user-id", userId);

  return new Request(request, { headers });
};

const protectAgentRequest = async (request: Request) => {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  return withInjectedUserIdHeader(request, session.user.id);
};

const fetch: RequestHandler<Register> = async (request, opts) => {
  const url = new URL(request.url);
  const agentName = matchAgentRoute(url);

  if (agentName) {
    const result = await protectAgentRequest(request);
    if (result instanceof Response) {
      return result;
    }

    return routeToAgent(result, workerEnv as unknown as { ChatAgent: DurableObjectNamespace<_ChatAgent> }, agentName);
  }

  return startFetch(request, opts);
};

const sentryOptions = (env: Record<string, string>) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

export const ChatAgent = _ChatAgent;

const serverEntry = createServerEntry({
  fetch,
});

export default withSentry(
  sentryOptions,
  serverEntry as ExportedHandler,
) as typeof serverEntry;
