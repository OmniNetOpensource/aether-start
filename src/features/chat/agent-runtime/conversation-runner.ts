import { DurableObject } from 'cloudflare:workers';
import { executeToolCall, getAvailableTools } from '@/features/chat/agent-runtime';
import {
  getDefaultModelConfig,
  getModelConfig,
  getPromptById,
  getDefaultPromptId,
} from '@/features/chat/model-catalog';
import { log } from '@/features/chat/agent-runtime';
import { getBackendConfig } from './providers/backend-config';
import { createChatProvider } from '@/features/chat/agent-runtime';
import type { ChatProvider, ProviderRunResult } from '@/features/chat/agent-runtime';
import type { FetchProvider } from './tool-types';
import { generateTitleFromConversation } from './chat-title';
import { generateAndPersistForYouSuggestions } from '@/features/chat/for-you/for-you-suggestions.server';
import { processEventToTree, cloneTreeSnapshot } from '@/features/chat/agent-runtime';
import {
  buildAskUserQuestionsModelResult,
  normalizeAskUserQuestionsAnswers,
  parseAskUserQuestions,
  parseAskUserQuestionsAnswerSubmission,
  type AskUserQuestionsQuestion,
} from '@/features/chat/ask-user-questions/ask-user-questions';
import {
  createConversationArtifact,
  getConversationById,
  upsertConversation,
} from '@/features/conversations/session';
import { consumePromptQuotaOnAccept } from '@/features/quota/quota-balance';
import type {
  ArtifactLanguage,
  ChatAgentStatus,
  ChatServerToClientEvent,
  MessageTreeSnapshot,
  PendingToolInvocation,
  PersistedChatEvent,
  ToolInvocationResult,
} from '@/features/chat/chat-api';
import type { Message, SerializedMessage } from '@/features/chat/message-thread';

// Durable Object 只服务一个会话实例，所以这里记录的是“这一个会话”当前的运行态。
// 前端恢复连接、轮询状态、发起中断时，都会依赖这里的信息判断该怎么继续。
type ConversationRunnerState = {
  status: ChatAgentStatus;
  conversationId: string | null;
  ownerUserId: string | null;
  updatedAt: number;
};

// 这里显式列出会被 provider、tool、持久化层读取到的绑定。
// 这样看这个文件时就能直接知道 ConversationRunner 依赖了哪些运行环境能力。
type ConversationRunnerEnv = Cloudflare.Env & {
  DB: D1Database;
  CHAT_ASSETS: R2Bucket;
  ANTHROPIC_API_KEY_RIGHTCODE?: string;
  ANTHROPIC_BASE_URL_RIGHTCODE?: string;
  ANTHROPIC_API_KEY_RIGHTCODE_SALE?: string;
  ANTHROPIC_BASE_URL_RIGHTCODE_SALE?: string;
  MOONSHOT_API_KEY?: string;
  ANTHROPIC_API_KEY_IKUNCODE?: string;
  ANTHROPIC_BASE_URL_IKUNCODE?: string;
  GEMINI_API_KEY_IKUNCODE?: string;
  GEMINI_BASE_URL_IKUNCODE?: string;
  DMX_APIKEY?: string;
  DMX_BASEURL?: string;
  OPENROUTER_API_KEY?: string;
  CUBENCE_API_KEY?: string;
  CUBENCE_BASE_URL?: string;
  SERP_API_KEY?: string;
  SUPADATA_API_KEY?: string;
};

// 请求体来自网络边界，先把 unknown 缩小成可用结构。
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// 标题生成只需要覆盖最近一段有效对话，截断可以控制 token 成本。
const MAX_TITLE_TRANSCRIPT_CHARS = 4_000;

// 标题只根据当前分支生成，而不是整棵消息树。
// 这样分叉会话重新命名时，标题能反映用户当前正在看的那条路径。
const extractConversationTranscript = (messages: Message[], currentPath: number[]) => {
  const lines = currentPath
    .map((id) => messages[id - 1])
    .filter((message): message is Message => Boolean(message))
    .map((message) => {
      const text = message.blocks
        .filter(
          (block): block is Extract<typeof block, { type: 'content' }> => block.type === 'content',
        )
        .map((block) => block.content)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) {
        return null;
      }

      const speaker = message.role === 'user' ? 'User' : 'Assistant';
      return `${speaker}: ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return '';
  }

  return lines.join('\n').slice(-MAX_TITLE_TRANSCRIPT_CHARS);
};

const toEventError = (message: string): ChatServerToClientEvent => ({
  type: 'error',
  message,
});

// 前端发起一次聊天请求时会同时上传：
// 1. conversationHistory：给模型推理用的线性消息历史
// 2. treeSnapshot：给服务端维护消息树和最终落库用的完整快照
type ChatRequestBody = {
  idempotencyKey: string;
  conversationId: string;
  model: string;
  promptId?: string;
  fetchProvider?: FetchProvider;
  conversationHistory: SerializedMessage[];
  treeSnapshot: MessageTreeSnapshot;
};

// 流式 artifact 事件在内存里拼出的「进行中」状态；completed 或 failed 后从 Map 移除。
type PendingArtifact = {
  id: string;
  title: string;
  language: ArtifactLanguage | null;
  code: string;
};

// 与闭包里的 throw 不同：显式传入 signal，方便在任意深度调用（工具循环、事件泵）里统一中断语义。
const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
};

/**
 * Artifact 相关 SSE 是一条增量流：started → title/language → code_delta → completed | failed。
 * 本类负责两件事：
 * 1. 跟随事件维护 pending，在 artifact_completed 时把成品写入 D1（与前端/树事件顺序一致）。
 * 2. 若整轮对话以非 completed 结束（中断、error、未跑完），由 drainPendingAsFailures 生成
 *    尚未完结的 artifact_failed，交给上层 emit（保证客户端能收口 UI，且与 finalize 里顺序可控）。
 */
class ArtifactAccumulator {
  private pending = new Map<string, PendingArtifact>();

  constructor(
    private env: ConversationRunnerEnv,
    private userId: string,
    private conversationId: string,
  ) {}

  /** 仅处理 artifact_* 类型；其它事件类型直接忽略。 */
  async handleEvent(event: ChatServerToClientEvent): Promise<void> {
    if (event.type === 'artifact_started') {
      this.pending.set(event.artifactId, {
        id: event.artifactId,
        title: 'Untitled Artifact',
        language: null,
        code: '',
      });
      return;
    }
    if (event.type === 'artifact_title') {
      const artifact = this.pending.get(event.artifactId);
      if (artifact) {
        artifact.title = event.title;
      }
      return;
    }
    if (event.type === 'artifact_language') {
      const artifact = this.pending.get(event.artifactId);
      if (artifact) {
        artifact.language = event.language;
      }
      return;
    }
    if (event.type === 'artifact_code_delta') {
      const artifact = this.pending.get(event.artifactId);
      if (artifact) {
        artifact.code += event.delta;
      }
      return;
    }
    if (event.type === 'artifact_completed') {
      const artifact = this.pending.get(event.artifactId);
      if (artifact && artifact.language && artifact.code.trim()) {
        const now = new Date().toISOString();
        await createConversationArtifact(this.env.DB, {
          user_id: this.userId,
          id: artifact.id,
          conversation_id: this.conversationId,
          title: artifact.title.trim() || 'Untitled Artifact',
          language: artifact.language,
          code: artifact.code,
          created_at: now,
          updated_at: now,
        });
      }
      this.pending.delete(event.artifactId);
      return;
    }
    if (event.type === 'artifact_failed') {
      this.pending.delete(event.artifactId);
    }
  }

  /**
   * 取出当前仍挂在 pending 里的 artifact，生成对应的 artifact_failed 事件并清空 Map。
   * 不直接广播：由调用方走统一的 emitEvent（会进消息树、SSE、缓存），与正常失败路径一致。
   */
  drainPendingAsFailures(reason: 'aborted' | 'error'): ChatServerToClientEvent[] {
    const message =
      reason === 'aborted'
        ? 'Artifact generation stopped before completion.'
        : 'Artifact generation failed before completion.';
    const events: ChatServerToClientEvent[] = [];
    for (const artifact of this.pending.values()) {
      events.push({
        type: 'artifact_failed',
        artifactId: artifact.id,
        message,
      });
    }
    this.pending.clear();
    return events;
  }
}

type PendingAskUserQuestions = {
  callId: string;
  conversationId: string;
  ownerUserId: string;
  questions: AskUserQuestionsQuestion[];
  submittedByUserId: string | null;
  answered: boolean;
  waitForAnswer: {
    resolve: (modelResult: string) => void;
    reject: (error: unknown) => void;
    clearAbortListener: () => void;
  } | null;
};

// 这里只做最低限度的结构校验，保证后续逻辑不会直接踩到 undefined / 类型错误。
const parseChatRequestBody = (body: unknown): ChatRequestBody | null => {
  if (!isObject(body)) return null;

  const idempotencyKey = asString(body.idempotencyKey);
  const conversationId = asString(body.conversationId);
  const model = asString(body.model);
  const promptId = asString(body.promptId) ?? undefined;
  const rawFetchProvider = asString(body.fetchProvider);
  const fetchProvider: FetchProvider | undefined =
    rawFetchProvider === 'jina' || rawFetchProvider === 'firecrawl' || rawFetchProvider === 'exa'
      ? rawFetchProvider
      : undefined;
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? (body.conversationHistory as SerializedMessage[])
    : null;
  const treeSnapshot = isObject(body.treeSnapshot) ? body.treeSnapshot : null;

  const snapshotMessages =
    treeSnapshot && Array.isArray(treeSnapshot.messages)
      ? (treeSnapshot.messages as Message[])
      : null;
  const snapshotPath =
    treeSnapshot && Array.isArray(treeSnapshot.currentPath)
      ? treeSnapshot.currentPath.filter((id): id is number => typeof id === 'number')
      : null;
  const snapshotLatestRootId =
    treeSnapshot &&
    (typeof treeSnapshot.latestRootId === 'number' || treeSnapshot.latestRootId === null)
      ? treeSnapshot.latestRootId
      : null;
  const snapshotNextId =
    treeSnapshot && typeof treeSnapshot.nextId === 'number' ? treeSnapshot.nextId : null;

  if (
    !idempotencyKey ||
    !conversationId ||
    !model ||
    !conversationHistory ||
    !snapshotMessages ||
    !snapshotPath ||
    snapshotNextId === null
  ) {
    return null;
  }

  return {
    idempotencyKey,
    conversationId,
    model,
    promptId,
    fetchProvider,
    conversationHistory,
    treeSnapshot: {
      messages: snapshotMessages,
      currentPath: snapshotPath,
      latestRootId: snapshotLatestRootId,
      nextId: snapshotNextId,
    },
  };
};

// 这个 Durable Object 以 conversation 为粒度串行化整次对话：
// 接收请求、推送 SSE、执行工具调用、缓存事件，并在结束后落库快照。
export class ConversationRunner extends DurableObject<ConversationRunnerEnv> {
  // instanceName 对应 URL 里的 conversationId。
  // 一个 Durable Object 实例一旦绑定某个会话，后续请求都应该落到同一个实例里。
  private instanceName: string | null = null;

  // abortController 负责终止当前运行中的模型调用和工具执行链路。
  private abortController: AbortController | null = null;
  // eventCache 用来支持断线重连。前端带上 lastEventId 后，可以从这里补拉遗漏事件。
  private eventCache: PersistedChatEvent[] = [];
  private nextEventId = 1;
  private runtimeState: ConversationRunnerState = {
    status: 'idle',
    conversationId: null,
    ownerUserId: null,
    updatedAt: Date.now(),
  };

  // /chat 的首条流式连接和 /events 的补连都会挂在这里一起收广播。
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private encoder = new TextEncoder();
  private pendingAskUserQuestions = new Map<string, PendingAskUserQuestions>();
  private liveEventSink: ((event: ChatServerToClientEvent) => Promise<void>) | null = null;

  // 第一次收到某个 conversation 的请求时，把实例和会话绑定起来。
  private ensureInitialized(name: string) {
    if (!this.instanceName) {
      this.instanceName = name;
      this.runtimeState.conversationId = name;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // 路由形如 /agents/conversation-runner/<conversationId>[/chat|events|abort]。
    // Durable Object 入口不走 TanStack Router，所以这里手动拆路径。
    const segments = url.pathname.split('/');
    const nameIndex = segments.indexOf('conversation-runner');
    const name = nameIndex >= 0 && segments.length > nameIndex + 1 ? segments[nameIndex + 1] : null;

    if (name) {
      this.ensureInitialized(name);
    }

    const sub = nameIndex >= 0 && segments.length > nameIndex + 2 ? segments[nameIndex + 2] : '';

    const userId = request.headers.get('x-aether-user-id')?.trim() ?? null;

    // 真正会操作会话内容的接口都要求知道当前用户，避免会话串号。
    if (request.method === 'POST' && sub === 'chat') {
      if (!userId) return new Response('Unauthorized', { status: 401 });
      return this.handleChat(request, userId);
    }

    if (request.method === 'POST' && sub === 'events') {
      if (!userId) return new Response('Unauthorized', { status: 401 });
      return this.handleEvents(request, userId);
    }

    if (request.method === 'POST' && sub === 'abort') {
      if (!userId) return new Response('Unauthorized', { status: 401 });
      return this.handleAbort(request, userId);
    }

    if (request.method === 'POST' && sub === 'tool-answer') {
      if (!userId) return new Response('Unauthorized', { status: 401 });
      return this.handleToolAnswer(request, userId);
    }

    // 空子路径只返回轻量状态，给前端恢复页面时探测“这个会话是不是还在跑”。
    if (request.method === 'GET' && sub === '') {
      return Response.json({ status: this.runtimeState.status });
    }

    return new Response('Not found', { status: 404 });
  }

  // ── SSE helpers ──────────────────────────────────────────────────────

  private sendSSE(writer: WritableStreamDefaultWriter<Uint8Array>, event: string, data: unknown) {
    // 单个连接写失败时只移除它自己，不影响其他订阅者继续收流。
    void writer
      .write(this.encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      .catch((error) => {
        this.writers.delete(writer);
        log('AGENT', 'Failed to write SSE event', {
          event,
          error: getErrorMessage(error),
        });
      });
  }

  private broadcast(event: string, data: unknown) {
    for (const w of this.writers) {
      this.sendSSE(w, event, data);
    }
  }

  private async closeAllWriters() {
    const writers = [...this.writers];
    this.writers.clear();
    const results = await Promise.allSettled(writers.map((writer) => writer.close()));
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        log('AGENT', 'Failed to close SSE writer', {
          writerIndex: index,
          error: getErrorMessage(result.reason),
        });
      }
    }
  }

  // ── POST /chat ───────────────────────────────────────────────────────

  // 接收一次新的聊天请求，完成鉴权、并发保护、quota 扣减，并立刻返回 SSE 流。
  // 真正的模型执行在后台进行，这样前端可以第一时间开始监听事件。
  private async handleChat(request: Request, userId: string): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (error) {
      log('AGENT', 'Failed to parse chat request body', error);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const message = parseChatRequestBody(rawBody);

    if (!message) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 同一个会话实例一次只允许一个请求运行。
    if (this.runtimeState.status === 'running') {
      return Response.json({ type: 'busy' }, { status: 409 });
    }

    // URL 定位到的 Durable Object 实例和 body 里声明的 conversationId 必须一致。
    // 不一致说明请求落到了错误实例，直接拒绝。
    if (message.conversationId !== this.instanceName) {
      return Response.json({ error: 'Conversation ID mismatch' }, { status: 400 });
    }

    // 一个会话一旦被某个用户占用，后续只允许同一用户继续访问这个实例。
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!this.runtimeState.ownerUserId) {
      this.runtimeState = { ...this.runtimeState, ownerUserId: userId };
    }

    // 新请求开始后，旧请求的事件缓存已经没有意义，先清掉避免重连时串事件。
    this.eventCache = [];

    // quota 在请求被“正式接受”时扣减，避免并发提交时出现重复接受。
    const consumeResult = await consumePromptQuotaOnAccept(
      this.env.DB,
      userId,
      message.idempotencyKey,
    );
    if (!consumeResult.ok) {
      let errorMessage: string;
      if (consumeResult.reason === 'insufficient') {
        errorMessage = '额度不足，请使用兑换码获取更多 prompt 额度';
      } else {
        errorMessage = `请求失败：${consumeResult.message}`;
      }
      return Response.json({ type: 'quota_error', message: errorMessage }, { status: 402 });
    }

    // 进入 running 状态后，状态探测和 /events 补连都会把这个会话视为仍在生成中。
    this.runtimeState = {
      status: 'running',
      conversationId: message.conversationId,
      ownerUserId: this.runtimeState.ownerUserId ?? userId,
      updatedAt: Date.now(),
    };

    // /chat 自己也返回一个 SSE 流，这样首个请求无需额外再发起一次 /events 订阅。
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    this.writers.add(writer);

    const userMessageCreatedAt = new Date().toISOString();
    const lastPathId = message.treeSnapshot.currentPath.at(-1);
    if (lastPathId) {
      const lastMsg = message.treeSnapshot.messages[lastPathId - 1];
      if (lastMsg && lastMsg.role === 'user') {
        lastMsg.createdAt = userMessageCreatedAt;
      }
    }
    this.broadcast('chat_started', { userMessageCreatedAt });

    // 在模型真正开始跑之前先把用户刚发出的消息落库。
    // 这样哪怕后续 provider 初始化失败，用户输入也不会丢。
    try {
      const existing = await getConversationById(this.env.DB, message.conversationId, userId);
      const now = new Date().toISOString();
      const title = existing?.title ?? 'New Chat';

      await upsertConversation(this.env.DB, {
        user_id: userId,
        id: message.conversationId,
        title,
        model: message.model ?? existing?.model ?? null,
        currentPath: message.treeSnapshot.currentPath,
        messages: message.treeSnapshot.messages,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });

      this.persistAndBroadcastEvent({
        type: 'conversation_updated',
        conversationId: message.conversationId,
        title,
        updated_at: now,
      });
    } catch (error) {
      log('AGENT', 'User message persist failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 客户端断连后 fetch 上下文会结束，但模型推理和最终 D1 落库仍需运行完成。
    // waitUntil 让运行时在后台任务结束前不驱逐这个 Durable Object。
    this.ctx.waitUntil(
      this.runChatInBackground(message, userId, signal)
        .catch((error) => {
          log('AGENT', 'runChatInBackground failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          this.abortController = null;
          void writer.close().catch((error) => {
            log('AGENT', 'Failed to close chat response writer', {
              error: getErrorMessage(error),
            });
          });
          this.writers.delete(writer);
        }),
    );

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // ── POST /events ─────────────────────────────────────────────────────

  // 给断线重连或页面恢复用的事件补拉入口。
  // 先回放 lastEventId 之后的缓存事件，再按当前状态决定是否继续挂长连接。
  private async handleEvents(request: Request, userId: string): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (error) {
      log('AGENT', 'Failed to parse events request body', error);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!isObject(rawBody)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const lastEventId = Number(rawBody.lastEventId ?? 0);

    // /events 虽然是只读补拉，但仍然只能由会话拥有者访问。
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!this.runtimeState.ownerUserId) {
      this.runtimeState = { ...this.runtimeState, ownerUserId: userId };
    }

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    // 先把客户端缺失的事件一次性补齐，再决定是否保持连接接收后续增量。
    const events = this.listEvents(lastEventId);
    this.sendSSE(writer, 'sync_response', {
      status: this.runtimeState.status,
      events,
    });

    // 会话还在运行时，需要继续保持长连接；否则回放完缓存即可关闭。
    if (this.runtimeState.status === 'running') {
      // Keep connection open to receive future events
      this.writers.add(writer);
    } else {
      // Not running — write sync data and close
      void writer.close().catch((error) => {
        log('AGENT', 'Failed to close sync response writer', {
          error: getErrorMessage(error),
        });
      });
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // ── POST /abort ──────────────────────────────────────────────────────

  // 中断当前运行中的请求。这里返回 ok，只表示中断信号已经发出。
  private async handleAbort(_request: Request, userId: string): Promise<Response> {
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (this.runtimeState.status !== 'running' || !this.abortController) {
      return Response.json({ ok: true });
    }

    this.abortController.abort();
    return Response.json({ ok: true });
  }

  private waitForAskUserQuestionsAnswer(
    conversationId: string,
    userId: string,
    callId: string,
    questions: AskUserQuestionsQuestion[],
    signal: AbortSignal,
  ) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (this.pendingAskUserQuestions.has(callId)) {
      throw new Error(`Interactive tool call already exists: ${callId}`);
    }

    return new Promise<string>((resolve, reject) => {
      const clearAbortListener = () => signal.removeEventListener('abort', onAbort);
      const onAbort = () => {
        const pending = this.pendingAskUserQuestions.get(callId);
        if (pending) {
          pending.waitForAnswer = null;
        }
        clearAbortListener();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });
      this.pendingAskUserQuestions.set(callId, {
        callId,
        conversationId,
        ownerUserId: userId,
        questions,
        submittedByUserId: null,
        answered: false,
        waitForAnswer: {
          resolve,
          reject,
          clearAbortListener,
        },
      });
    });
  }

  private async handleToolAnswer(request: Request, userId: string): Promise<Response> {
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    let rawBody: Record<string, unknown>;
    try {
      rawBody = await request.json();
    } catch (error) {
      log('AGENT', 'Failed to parse tool answer request body', error);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const payload = parseAskUserQuestionsAnswerSubmission(rawBody);
    if (!payload) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const pending = this.pendingAskUserQuestions.get(payload.callId);
    if (!pending || pending.conversationId !== this.instanceName) {
      return Response.json({ error: 'Tool call not found' }, { status: 404 });
    }

    if (pending.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (pending.answered) {
      return Response.json({ error: 'Tool call already answered' }, { status: 409 });
    }

    if (!this.liveEventSink || !pending.waitForAnswer) {
      return Response.json(
        { error: 'Conversation is not waiting for a tool answer' },
        { status: 409 },
      );
    }

    let answers;
    try {
      answers = normalizeAskUserQuestionsAnswers(pending.questions, payload.answers);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Invalid answers' },
        { status: 400 },
      );
    }

    pending.answered = true;
    pending.submittedByUserId = userId;

    await this.liveEventSink({
      type: 'ask_user_questions_answered',
      callId: pending.callId,
      answers,
    });

    pending.waitForAnswer.resolve(buildAskUserQuestionsModelResult(pending.questions, answers));
    pending.waitForAnswer.clearAbortListener();
    pending.waitForAnswer = null;

    return Response.json({ ok: true });
  }

  // ── Background chat execution ────────────────────────────────────────
  //
  // 心智模型（与 runChatInBackground 主循环对齐）：
  //   准备上下文 → while：跑一轮 provider（流式 emit）→ 中间快照 → 若出错或自然结束则退出
  //   → 否则执行本轮 pending 工具 → 把工具结果拼进消息 → 再进下一轮 while。
  // conversationHistory 的结构合法性由 parseChatRequestBody 保证，这里只做业务级校验（非空、有有效用户消息）。

  /**
   * 从 HTTP 已解析的 body 构造「可跑模型」所需的一切：校验、选模型与 prompt、创建统一 ChatProvider、
   * 把 SerializedMessage[] 转成供应商内部消息格式（workingMessages）。
   * 任一步失败都会 emit error 事件并返回 null，调用方将 finalStatus 置为 error，不再进入主循环。
   */
  private async prepareContext(
    message: ChatRequestBody,
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
  ): Promise<{
    provider: ChatProvider;
    workingMessages: Awaited<ReturnType<ChatProvider['convertMessages']>>;
  } | null> {
    const { conversationHistory, model, promptId } = message;

    if (conversationHistory.length === 0) {
      await emitEvent(toEventError('Invalid conversation history: expected non-empty array.'));
      return null;
    }

    const latestUserMessage = [...conversationHistory]
      .reverse()
      .find((item) => item.role === 'user');
    if (
      !latestUserMessage ||
      !Array.isArray(latestUserMessage.blocks) ||
      latestUserMessage.blocks.length === 0
    ) {
      await emitEvent(
        toEventError('Missing user message: latest user message missing or has empty blocks.'),
      );
      return null;
    }

    const modelConfig = model ? getModelConfig(model) : getDefaultModelConfig();
    if (!modelConfig) {
      await emitEvent(toEventError(`Invalid or missing model: "${String(model ?? '')}".`));
      return null;
    }

    const promptConfig = promptId ? getPromptById(promptId) : getPromptById(getDefaultPromptId());
    const systemPrompt = promptConfig?.content ?? '';

    const backendConfig = getBackendConfig(modelConfig.backend);

    const provider = await createChatProvider(modelConfig.format, {
      model: modelConfig.model,
      backendConfig,
      tools: getAvailableTools(),
      systemPrompt,
    });

    const workingMessages = await provider.convertMessages(conversationHistory);
    return { provider, workingMessages };
  }

  /**
   * 「一轮」= 带着当前 workingMessages 调用 provider.run，直到 generator 结束。
   * 流式事件逐条经 emitEvent（更新消息树、累计 error、artifact、广播）；每 emit 后检查 abort。
   * 返回的 assistantText 仅统计 content 事件，供后续 formatToolContinuation 拼用户可见正文；
   * runResult 含本轮结束时的 pendingToolCalls；hadErrors 通过 emit 前后 error 条数差判断（替代旧实现里
   * errorEventCountBeforeRun 快照），与「本轮是否出现 error 类型事件」语义一致。
   */
  private async runOneTurn(
    provider: ChatProvider,
    workingMessages: Awaited<ReturnType<ChatProvider['convertMessages']>>,
    signal: AbortSignal,
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
    getErrorCount: () => number,
  ): Promise<{ runResult: ProviderRunResult; hadErrors: boolean }> {
    const errorBefore = getErrorCount();
    const generator = provider.run(workingMessages, signal);
    let runResult: ProviderRunResult = {
      pendingToolCalls: [],
      thinkingBlocks: [],
      assistantText: '',
    };

    while (true) {
      const { done, value } = await generator.next();
      if (done) {
        runResult = value;
        break;
      }

      await emitEvent(value);
      throwIfAborted(signal);
    }

    return {
      runResult,
      hadErrors: getErrorCount() > errorBefore,
    };
  }

  /**
   * 交互式工具 askuserquestions：先广播「需要用户填表」，再通过 Promise 阻塞直到 /tool-answer 写入答案或 abort。
   * Abort 必须向上抛，让外层把整轮标为 aborted；其它异常转成工具结果字符串，模型可在下一轮读错误信息继续。
   */
  private async executeAskUserQuestions(
    toolCall: PendingToolInvocation,
    message: ChatRequestBody,
    userId: string,
    signal: AbortSignal,
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
  ): Promise<ToolInvocationResult> {
    try {
      const questions = parseAskUserQuestions(toolCall.args);
      await emitEvent({
        type: 'ask_user_questions_requested',
        callId: toolCall.id,
        questions,
      });

      const modelResult = await this.waitForAskUserQuestionsAnswer(
        message.conversationId,
        userId,
        toolCall.id,
        questions,
        signal,
      );

      return {
        id: toolCall.id,
        name: toolCall.name,
        result: modelResult,
      };
    } catch (error) {
      const isAbortError =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal.aborted;

      if (isAbortError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      log('TOOLS', 'Interactive askuserquestions failed', {
        error: errorMessage,
        callId: toolCall.id,
      });
      return {
        id: toolCall.id,
        name: toolCall.name,
        result: `Error executing askuserquestions: ${errorMessage}`,
      };
    }
  }

  /**
   * 按模型给出的顺序依次执行本轮所有工具调用；askuserquestions 走人机交互，其余走 executeToolCall。
   * 普通工具返回的中间事件同样经 emitEvent 进入全局事件流（与模型流式事件同一套树与 SSE）。
   */
  private async executeAllToolCalls(
    pendingToolCalls: PendingToolInvocation[],
    message: ChatRequestBody,
    userId: string,
    signal: AbortSignal,
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
  ): Promise<ToolInvocationResult[]> {
    const toolResults: ToolInvocationResult[] = [];

    for (const toolCall of pendingToolCalls) {
      throwIfAborted(signal);

      if (toolCall.name === 'askuserquestions') {
        toolResults.push(
          await this.executeAskUserQuestions(toolCall, message, userId, signal, emitEvent),
        );
        continue;
      }

      const executedToolCall = await executeToolCall(toolCall, signal, {
        fetchProvider: message.fetchProvider,
      });
      for (const event of executedToolCall.events) {
        await emitEvent(event);
        throwIfAborted(signal);
      }
      toolResults.push(executedToolCall.result);
    }

    return toolResults;
  }

  /**
   * 单次后台运行的收尾：无论 try 成功、return 还是 catch，finally 都会执行。
   * - 断开 liveEventSink，拒绝仍在等待的 askuserquestions，避免 /tool-answer 误匹配旧会话。
   * - 非成功结束时为未完结 artifact 补发 failed（经 emitEvent，与正常事件同源）。
   * - 给当前路径上最后一条 assistant 打 completedAt，落最终快照，必要时刷新 for-you，更新 DO 状态并 chat_finished。
   * runState 以对象传入，便于最终快照失败时把 finalStatus 纠正为 error。
   */
  private async finalize(
    runState: { finalStatus: Exclude<ChatAgentStatus, 'idle' | 'running'> },
    message: ChatRequestBody,
    userId: string,
    workingTree: MessageTreeSnapshot,
    artifactAccumulator: ArtifactAccumulator,
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
  ) {
    this.liveEventSink = null;
    for (const pending of this.pendingAskUserQuestions.values()) {
      pending.waitForAnswer?.reject(new DOMException('Aborted', 'AbortError'));
      pending.waitForAnswer?.clearAbortListener();
    }
    this.pendingAskUserQuestions.clear();

    if (runState.finalStatus !== 'completed') {
      const reason = runState.finalStatus === 'aborted' ? 'aborted' : 'error';
      for (const event of artifactAccumulator.drainPendingAsFailures(reason)) {
        await emitEvent(event);
      }
    }

    let assistantCompletedAt: string | undefined;
    const lastTreeId = workingTree.currentPath.at(-1);
    if (lastTreeId) {
      const lastTreeMsg = workingTree.messages[lastTreeId - 1];
      if (lastTreeMsg && lastTreeMsg.role === 'assistant') {
        assistantCompletedAt = new Date().toISOString();
        lastTreeMsg.completedAt = assistantCompletedAt;
      }
    }

    try {
      await this.persistConversationSnapshot(
        message.conversationId,
        userId,
        cloneTreeSnapshot(workingTree),
        message.model,
        runState.finalStatus === 'completed',
      );
    } catch (error) {
      runState.finalStatus = 'error';
      log('AGENT', 'Persist final conversation snapshot failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (runState.finalStatus === 'completed') {
      generateAndPersistForYouSuggestions(this.env.DB, userId).catch((error) => {
        log('AGENT', 'For-you suggestion refresh failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    this.runtimeState = {
      ...this.runtimeState,
      status: runState.finalStatus,
      updatedAt: Date.now(),
    };

    this.broadcast('chat_finished', { status: runState.finalStatus, assistantCompletedAt });
    await this.closeAllWriters();
  }

  /**
   * /chat 返回 SSE 后，真正跑模型与工具的逻辑；与 HTTP handler 解耦，便于 waitUntil 后台执行。
   * emitEvent 是单一路由：先推进 workingTree（与前端一致的事实来源）、累计 error 条数、artifact 副作用、再入缓存并 SSE。
   */
  private async runChatInBackground(message: ChatRequestBody, userId: string, signal: AbortSignal) {
    const runState = { finalStatus: 'completed' as Exclude<ChatAgentStatus, 'idle' | 'running'> };
    let workingTree = cloneTreeSnapshot(message.treeSnapshot);
    let errorEventCount = 0;
    const artifactAccumulator = new ArtifactAccumulator(this.env, userId, message.conversationId);

    const emitEvent = async (event: ChatServerToClientEvent) => {
      workingTree = processEventToTree(workingTree, event);
      if (event.type === 'error') {
        errorEventCount += 1;
      }
      await artifactAccumulator.handleEvent(event);
      this.persistAndBroadcastEvent(event);
    };
    this.liveEventSink = emitEvent;

    try {
      const prepared = await this.prepareContext(message, emitEvent);
      if (!prepared) {
        runState.finalStatus = 'error';
        return;
      }

      let { provider, workingMessages } = prepared;

      // 核心循环：每一轮先跑模型，再根据 stop 原因决定是结束还是跑工具并拼 continuation。
      while (true) {
        throwIfAborted(signal);

        const { runResult, hadErrors } = await this.runOneTurn(
          provider,
          workingMessages,
          signal,
          emitEvent,
          () => errorEventCount,
        );

        // 与 provider 的「自然结束 / 工具暂停」对齐：本轮若出现 error 事件则视为 error；
        // 否则有待执行工具则为 tool_calls；二者皆否则为本轮模型侧 completed。
        const modelStopReason = hadErrors
          ? 'error'
          : runResult.pendingToolCalls.length > 0
            ? 'tool_calls'
            : 'completed';

        // 长链路 tool-use 中途崩溃时，中间快照能保住已生成的树状态；regenerateTitle 仅当本轮 completed 为 true。
        try {
          await this.persistConversationSnapshot(
            message.conversationId,
            userId,
            cloneTreeSnapshot(workingTree),
            message.model,
            modelStopReason === 'completed',
          );
        } catch (error) {
          log('AGENT', 'Intermediate snapshot persist failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (modelStopReason === 'error') {
          runState.finalStatus = 'error';
          break;
        }

        if (modelStopReason === 'completed') {
          break;
        }

        // tool_calls：执行完毕后由 provider 把 assistant 输出 + 工具结果编码进下一轮 messages。
        const toolResults = await this.executeAllToolCalls(
          runResult.pendingToolCalls,
          message,
          userId,
          signal,
          emitEvent,
        );

        workingMessages = [
          ...workingMessages,
          ...provider.formatToolContinuation(runResult, toolResults),
        ];
      }
    } catch (error) {
      // 部分失败只通过 error 事件表达，不 throw；会走到这里的是 Abort 或真正的异常。
      const isAbortError =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal.aborted;

      if (isAbortError) {
        runState.finalStatus = 'aborted';
      } else {
        runState.finalStatus = 'error';
        const errorMessage = error instanceof Error ? error.message : String(error);
        await emitEvent(toEventError(`错误：${errorMessage}`));
      }
    } finally {
      // 始终收口：清理交互状态、补 artifact、最终落库、广播结束并关闭所有 SSE 连接。
      await this.finalize(runState, message, userId, workingTree, artifactAccumulator, emitEvent);
    }
  }

  // ── Event cache ──────────────────────────────────────────────────────

  private listEvents(lastEventId: number): PersistedChatEvent[] {
    return this.eventCache.filter((e) => e.eventId > lastEventId);
  }

  private persistAndBroadcastEvent(event: ChatServerToClientEvent) {
    const eventId = this.nextEventId++;
    const createdAt = Date.now();

    this.eventCache.push({ eventId, event, createdAt });
    this.broadcast('chat_event', { eventId, event });
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private async persistConversationSnapshot(
    conversationId: string,
    userId: string,
    snapshot: {
      messages: Message[];
      currentPath: number[];
      latestRootId: number | null;
      nextId: number;
    },
    model?: string,
    regenerateTitle = false,
  ) {
    const existing = await getConversationById(this.env.DB, conversationId, userId);
    const now = new Date().toISOString();

    let resolvedTitle = existing?.title ?? 'New Chat';

    if (regenerateTitle) {
      // 标题生成只基于当前路径上真正可见的正文内容，不包含工具中间态或空块。
      const conversationTranscript = extractConversationTranscript(
        snapshot.messages,
        snapshot.currentPath,
      );

      if (conversationTranscript) {
        resolvedTitle = await generateTitleFromConversation(conversationTranscript);
      }
    }

    await upsertConversation(this.env.DB, {
      user_id: userId,
      id: conversationId,
      title: resolvedTitle,
      model: model ?? existing?.model ?? null,
      currentPath: snapshot.currentPath,
      messages: snapshot.messages,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });

    // 标题和更新时间变更后同步广播，让侧边栏列表和当前会话页保持一致。
    this.persistAndBroadcastEvent({
      type: 'conversation_updated',
      conversationId,
      title: resolvedTitle,
      updated_at: now,
    });
  }
}
