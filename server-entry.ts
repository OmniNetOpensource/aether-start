import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { createServerEntry } from '@tanstack/react-start/server-entry';
import type { RequestHandler } from '@tanstack/react-start/server';
import type { Register } from '@tanstack/react-router';
import { getSessionFromRequest } from '@/features/auth/server/session';

// 所有发往聊天 Durable Object 的请求都约定挂在这个前缀下：
// /agents/chat-agent/<conversation-or-instance-name>/...
// 入口文件会先识别这个前缀，再决定是否把请求转发给 ChatAgent。
const AGENT_PATH_PREFIX = '/agents/chat-agent/';

// 整个 Cloudflare Worker 的统一 fetch 入口。
//
// 这里做的事情其实就是“分流”：
// - 如果命中 /agents/chat-agent/...，说明这是一个需要进入 Durable Object 的长生命周期请求
// - 否则就是普通应用请求，交回 TanStack Start 默认处理器
//
// 之所以在最外层做这层分流，而不是把 agent 也塞进普通路由系统里，是因为
// ChatAgent 依赖 Durable Object 的单实例状态、SSE 广播和长生命周期运行能力，
// 这些和普通页面/接口请求的处理模型不是一回事。
const fetch: RequestHandler<Register> = async (request, opts) => {
  const url = new URL(request.url);
  const agentName = url.pathname.startsWith(AGENT_PATH_PREFIX)
    ? url.pathname.slice(AGENT_PATH_PREFIX.length).split('/')[0] || null
    : null;

  if (agentName) {
    // agent 请求必须先带上登录态。
    // 通过后把 user id 注入一个内部 header，后面的 Durable Object 就不需要重复解析 session。
    const session = await getSessionFromRequest(request);
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const headers = new Headers(request.headers);
    headers.set('x-aether-user-id', session.user.id);
    const authedRequest = new Request(request, { headers });

    // env 来自 cloudflare:workers 运行时，类型收窄后取 ChatAgent 绑定。
    // 同一个 name 经过 idFromName(name) 后总会映射到同一实例。
    const chatAgent = (env as Env).ChatAgent;
    const id = chatAgent.idFromName(agentName);
    const agentProxy = chatAgent.get(id);
    return agentProxy.fetch(authedRequest);
  }

  return createStartHandler(defaultStreamHandler)(request, opts);
};

// 必须把 Durable Object 类从 worker 入口导出。
// Cloudflare 会根据这个导出和 wrangler 配置来注册 ChatAgent 绑定。
export { ChatAgent } from '@/features/chat/server/agents/chat-agent';

// createServerEntry 会把上面的 fetch 处理器包装成 TanStack Start 认识的 worker 入口对象。
const serverEntry = createServerEntry({
  fetch,
});

// 最终导出给 Cloudflare 的默认入口。
export default serverEntry;
