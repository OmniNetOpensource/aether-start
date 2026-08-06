import { createStartHandler, defaultStreamHandler } from '@tanstack/solid-start/server';
import { env } from 'cloudflare:workers';
import { createServerEntry } from '@tanstack/solid-start/server-entry';
import type { RequestHandler } from '@tanstack/solid-start/server';
import type { Register } from '@tanstack/solid-router';
import { getSessionFromRequest } from '@/backend/auth/request';

// 所有发往聊天 Durable Object 的请求都约定挂在这个前缀下：
// /agents/conversation-runner/<conversation-or-instance-name>/...
// 入口文件会先识别这个前缀，再决定是否把请求转发给 ConversationRunner。
const AGENT_PATH_PREFIX = '/agents/conversation-runner/';

// 整个 Cloudflare Worker 的统一 fetch 入口。
//
// 这里做的事情其实就是“分流”：
// - 如果命中 /agents/conversation-runner/...，说明这是一个需要进入 Durable Object 的长生命周期请求
// - 否则就是普通应用请求，交回 TanStack Start 默认处理器
//
// 之所以在最外层做这层分流，而不是把 agent 也塞进普通路由系统里，是因为
// ConversationRunner 依赖 Durable Object 的单实例状态、SSE 广播和长生命周期运行能力，
// 这些和普通页面/接口请求的处理模型不是一回事。
const fetch: RequestHandler<Register> = async (request, opts) => {
  const url = new URL(request.url);
  const createsConversation =
    request.method === 'POST' && url.pathname === `${AGENT_PATH_PREFIX}chat`;
  const agentName = createsConversation
    ? crypto.randomUUID()
    : url.pathname.startsWith(AGENT_PATH_PREFIX)
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
    headers.delete('x-aether-new-conversation');
    if (createsConversation) {
      headers.set('x-aether-new-conversation', '1');
      url.pathname = `${AGENT_PATH_PREFIX}${agentName}/chat`;
    }
    const authedRequest = createsConversation
      ? new Request(url, {
          body: await request.arrayBuffer(),
          headers,
          method: request.method,
        })
      : new Request(request, { headers });

    // env 来自 cloudflare:workers 运行时，类型收窄后取 ConversationRunner 绑定。
    // 同一个 name 经过 idFromName(name) 后总会映射到同一实例。
    const conversationRunner = env.ConversationRunner;
    if (!conversationRunner) {
      throw new Error('Missing durable object binding: ConversationRunner');
    }
    const id = conversationRunner.idFromName(agentName);
    const agentProxy = conversationRunner.get(id);
    return agentProxy.fetch(authedRequest);
  }

  return createStartHandler(defaultStreamHandler)(request, opts);
};

// 必须把 Durable Object 类从 worker 入口导出。
// Cloudflare 会根据这个导出和 wrangler 配置来注册 ConversationRunner 绑定。
export { ConversationRunner } from '@/backend/chat/agent/conversation-runner';

// createServerEntry 会把上面的 fetch 处理器包装成 TanStack Start 认识的 worker 入口对象。
const serverEntry = createServerEntry({
  fetch,
});

// 最终导出给 Cloudflare 的默认入口。
export default serverEntry;
