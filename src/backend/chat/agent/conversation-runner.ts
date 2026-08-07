import { isAbortError } from '@/backend/chat/abort';
import { DurableObject } from 'cloudflare:workers';
import { executeToolCall, getAvailableTools } from '@/backend/chat/agent/tool-executor';
import {
  getDefaultModelConfig,
  getModelConfig,
  getPromptById,
  getDefaultPromptId,
} from '@/shared/chat/model-catalog';
import { log } from '@/backend/chat/logger';
import { getBackendConfig } from '@/backend/chat/providers/backend-config';
import { createChatProvider } from '@/backend/chat/providers/provider-factory';
import type { ChatProvider, ProviderRunResult } from '@/backend/chat/providers/provider-types';
import type { FetchProvider } from '@/shared/chat/tool-types';
import { generateTitleFromConversation } from '@/backend/chat/chat-title';
import { processEventToTree, cloneTreeSnapshot } from './event-processor';
import { applyOperation } from '@/backend/conversations/operation';
import { computeMessagesFromPath } from '@/shared/conversations';
import {
  buildAskUserQuestionsModelResult,
  normalizeAskUserQuestionsAnswers,
} from '@/backend/chat/tools/ask-user-questions';
import {
  parseAskUserQuestions,
  parseAskUserQuestionsAnswerSubmission,
} from '@/schema/ask-user-questions';
import type { AskUserQuestionsQuestion } from '@/shared/chat/ask-user-questions';
import {
  createConversationArtifact,
  getConversationById,
  upsertConversation,
} from '@/backend/conversations/conversations-db';
import { consumePromptQuotaOnAccept } from '@/backend/quota/prompt-quota-db';
import type {
  ArtifactLanguage,
  ChatAgentStatus,
  ChatCommandResponse,
  ChatFinishedPayload,
  Operation,
  ChatServerToClientEvent,
  MessageTreeSnapshot,
  PendingToolInvocation,
  PersistedChatEvent,
  ToolInvocationResult,
} from '@/shared/chat/chat-api';
import {
  isMessage,
  isUserContentBlock,
  type Message,
  type SerializedMessage,
} from '@/shared/chat/message';

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
  CHAT_ASSETS?: R2Bucket;
  MOONSHOT_API_KEY?: string;
  ANTHROPIC_API_KEY_IKUNCODE?: string;
  OPENAI_API_KEY_IKUNCODE?: string;
  GEMINI_API_KEY_IKUNCODE?: string;
  GEMINI_BASE_URL_IKUNCODE?: string;
  GEMINI_API_KEY_AISTUDIO?: string;
  OPENROUTER_API_KEY?: string;
  SERP_API_KEY?: string;
  SUPADATA_API_KEY?: string;
};

// 请求体来自网络边界，先把 unknown 缩小成可用结构。
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const asMessageId = (value: unknown): number | null | undefined => {
  if (value === null) {
    return null;
  }
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
};

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

type ChatRequestBody = {
  idempotencyKey: string;
  conversationId: string | null;
  model: string;
  promptId?: string;
  fetchProvider?: FetchProvider;
  operation: Operation;
};

type PreparedChatRequest = Omit<ChatRequestBody, 'conversationId'> & {
  conversationId: string;
  conversationHistory: SerializedMessage[];
  /** 本 run 的 assistant 占位消息 id,所有流式事件的写入目标 */
  assistantMessageId: number;
  /** run 级路径:发给模型的分支上下文与标题生成用,不落库 */
  runPath: number[];
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
  /** 提问所属 run 的 assistant 占位消息 id;回答事件与 finalize 清理都按它路由 */
  assistantMessageId: number;
  questions: AskUserQuestionsQuestion[];
  submittedByUserId: string | null;
  answered: boolean;
  emitEvent: (event: ChatServerToClientEvent) => Promise<void>;
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
  const rawOperation = body.operation;

  let operation: Operation | null = null;
  if (isObject(rawOperation) && rawOperation.type === 'append' && isObject(rawOperation.message)) {
    const parentId = asMessageId(rawOperation.parentId);
    const previousSiblingId = asMessageId(rawOperation.previousSiblingId);
    if (
      rawOperation.message.role === 'user' &&
      Array.isArray(rawOperation.message.blocks) &&
      rawOperation.message.blocks.length > 0 &&
      rawOperation.message.blocks.every(isUserContentBlock) &&
      parentId !== undefined &&
      previousSiblingId !== undefined
    ) {
      operation = {
        type: 'append',
        message: {
          role: 'user',
          blocks: rawOperation.message.blocks,
        },
        parentId,
        previousSiblingId,
      };
    }
  }

  if (isObject(rawOperation) && rawOperation.type === 'regenerate') {
    const currentMessageId = asMessageId(rawOperation.currentMessageId);
    if (currentMessageId) {
      operation = { type: 'regenerate', currentMessageId };
    }
  }

  if (!idempotencyKey || !model || !operation) {
    return null;
  }

  return {
    idempotencyKey,
    conversationId,
    model,
    promptId,
    fetchProvider,
    operation,
  };
};

// 这个 Durable Object 以 conversation 为粒度串行化整次对话：
// 接收请求、通过 WebSocket 推送事件、执行工具调用、缓存事件，并在结束后落库快照。
export class ConversationRunner extends DurableObject<ConversationRunnerEnv> {
  // instanceName 对应 URL 里的 conversationId。
  // 一个 Durable Object 实例一旦绑定某个会话，后续请求都应该落到同一个实例里。
  private instanceName: string | null = null;

  // 每个 run(一次模型生成)以自己的 assistant 占位消息 id 为键,abort 可以精确到单个 run。
  private runs = new Map<number, { abortController: AbortController }>();
  // 会话级共享树:所有 run 的事件都写它,落库也永远持久化它。最后一个 run 收口后释放。
  private activeTree: MessageTreeSnapshot | null = null;
  // 自上次缓存清空以来已收口的 run(assistantMessageId → completedAt),供断线补拉恢复状态。
  private finishedRuns = new Map<number, string | null>();
  // eventCache 用来支持断线重连。前端带上 lastEventId 后，可以从这里补拉遗漏事件。
  private eventCache: PersistedChatEvent[] = [];
  private nextEventId = 1;
  private runtimeState: ConversationRunnerState = {
    status: 'idle',
    conversationId: null,
    ownerUserId: null,
    updatedAt: Date.now(),
  };

  private pendingAskUserQuestions = new Map<string, PendingAskUserQuestions>();

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
      return this.handleChat(
        request,
        userId,
        request.headers.get('x-aether-new-conversation') === '1',
      );
    }

    if (request.method === 'GET' && sub === 'events') {
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

  // ── WebSocket broadcast ──────────────────────────────────────────────

  // 连接由 runtime 维护(Hibernation API)，休眠恢复后 getWebSockets() 依然返回存活连接。
  // 单个连接发送失败只记日志，不影响其他订阅者。
  private broadcast(event: string, data: unknown) {
    const payload = JSON.stringify({ event, data });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch (error) {
        log('AGENT', 'Failed to send WebSocket event', {
          event,
          error: getErrorMessage(error),
        });
      }
    }
  }

  // ── POST /chat ───────────────────────────────────────────────────────

  // 接收一次新的聊天请求。多 run 并发:树操作应用到共享树后发出 tree_operation 事件,
  // 响应只回回执;树变更与模型输出统一由 /events 推送。
  private async handleChat(
    request: Request,
    userId: string,
    createsConversation: boolean,
  ): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (error) {
      log('AGENT', 'Failed to parse chat request body', error);
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const requestMessage = parseChatRequestBody(rawBody);

    if (!requestMessage) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!this.instanceName) {
      return Response.json({ error: 'Conversation ID missing' }, { status: 400 });
    }

    if (
      createsConversation
        ? requestMessage.conversationId !== null ||
          requestMessage.operation.type !== 'append' ||
          requestMessage.operation.parentId !== null ||
          requestMessage.operation.previousSiblingId !== null
        : requestMessage.conversationId !== this.instanceName
    ) {
      return Response.json({ error: 'Conversation ID mismatch' }, { status: 400 });
    }

    const conversationId = this.instanceName;

    // 一个会话一旦被某个用户占用，后续只允许同一用户继续访问这个实例。
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!this.runtimeState.ownerUserId) {
      this.runtimeState = { ...this.runtimeState, ownerUserId: userId };
    }

    const existing = await getConversationById(this.env.DB, conversationId, userId);
    if (createsConversation && existing) {
      return Response.json({ error: 'Conversation already exists' }, { status: 409 });
    }

    // 有 run 在跑时共享树是最新事实(含未落库的流式内容与占位消息),必须基于它做树操作;
    // 否则从 D1 读,并以此初始化共享树。
    let baseMessages: Message[];
    if (this.activeTree) {
      baseMessages = this.activeTree.messages;
    } else {
      const existingMessages = existing?.messages.filter(isMessage) ?? [];
      if (existing && existingMessages.length !== existing.messages.length) {
        return Response.json({ error: 'Invalid persisted message tree' }, { status: 500 });
      }
      baseMessages = existingMessages;
    }

    const operationResult = applyOperation(
      baseMessages,
      requestMessage.operation,
      new Date().toISOString(),
    );
    if (!operationResult) {
      return Response.json({ error: 'Invalid chat operation' }, { status: 400 });
    }

    const assistantMessageId = operationResult.assistantMessage.id;

    const message: PreparedChatRequest = {
      ...requestMessage,
      conversationId,
      assistantMessageId,
      runPath: operationResult.treeSnapshot.currentPath,
      conversationHistory: computeMessagesFromPath(
        operationResult.treeSnapshot.messages,
        operationResult.treeSnapshot.currentPath,
      )
        .filter((item) => item.id !== assistantMessageId)
        .map(
          (item): SerializedMessage =>
            item.role === 'user'
              ? { role: 'user', blocks: item.blocks }
              : { role: 'assistant', blocks: item.blocks },
        ),
    };

    // quota 在请求被“正式接受”时扣减，避免并发提交时出现重复接受。
    const consumeResult = await consumePromptQuotaOnAccept(
      this.env.DB,
      userId,
      message.idempotencyKey,
    );
    if (!consumeResult.ok) {
      return Response.json(
        { type: 'quota_error', message: '额度不足，请使用兑换码获取更多 prompt 额度' },
        { status: 402 },
      );
    }

    const now = new Date().toISOString();
    const title = existing?.title ?? 'New Chat';
    try {
      await upsertConversation(this.env.DB, {
        user_id: userId,
        id: message.conversationId,
        title,
        model: message.model ?? existing?.model ?? null,
        messages: operationResult.treeSnapshot.messages,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
    } catch (error) {
      log('AGENT', 'Chat operation persist failed', {
        error: getErrorMessage(error),
      });
      return Response.json({ error: 'Failed to persist chat operation' }, { status: 500 });
    }

    // 树操作落库后才接受请求:更新共享树,广播 tree_operation 让所有客户端同步树结构。
    this.activeTree = operationResult.treeSnapshot;
    this.runtimeState = {
      status: 'running',
      conversationId: message.conversationId,
      ownerUserId: this.runtimeState.ownerUserId ?? userId,
      updatedAt: Date.now(),
    };
    this.persistAndBroadcastEvent(
      {
        type: 'tree_operation',
        assistantMessageId,
        changedMessages: operationResult.changedMessages,
      },
      null,
    );
    this.persistAndBroadcastEvent(
      {
        type: 'conversation_updated',
        conversationId: message.conversationId,
        title,
        updated_at: now,
      },
      null,
    );

    const abortController = new AbortController();
    this.runs.set(assistantMessageId, { abortController });

    // 客户端断连后 fetch 上下文会结束，但模型推理和最终 D1 落库仍需运行完成。
    // waitUntil 让运行时在后台任务结束前不驱逐这个 Durable Object。
    this.ctx.waitUntil(
      this.runChatInBackground(message, userId, abortController.signal).catch((error) => {
        log('AGENT', 'runChatInBackground failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }),
    );

    const acceptedPayload: ChatCommandResponse = {
      conversationId,
      userMessage: operationResult.userMessage,
      assistantMessage: operationResult.assistantMessage,
    };
    return Response.json(acceptedPayload);
  }

  // ── GET /events (WebSocket) ──────────────────────────────────────────

  // assistant 输出、断线重连和页面恢复共用的事件入口。
  // 握手只做鉴权与升级；补拉在客户端发来第一条 { lastEventId } 消息时进行(webSocketMessage)。
  private handleEvents(request: Request, userId: string): Response {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!this.runtimeState.ownerUserId) {
      this.runtimeState = { ...this.runtimeState, ownerUserId: userId };
    }

    const pair = new WebSocketPair();
    // acceptWebSocket 走 Hibernation API:等待期间 DO 可休眠，连接保持打开，
    // 消息到达时通过 webSocketMessage 唤醒。
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // 客户端连上后发 { lastEventId }，这里回放缺失事件并附带当前 run 状态。
  // 之后该连接只被动接收 broadcast，不再有其他上行消息。
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(message);
    } catch (error) {
      log('AGENT', 'Failed to parse WebSocket message', { error: getErrorMessage(error) });
      return;
    }
    if (!isObject(rawBody)) return;

    const lastEventId = Number(rawBody.lastEventId ?? 0);
    ws.send(
      JSON.stringify({
        event: 'sync_response',
        data: {
          status: this.runtimeState.status,
          events: this.listEvents(lastEventId),
          activeRuns: [...this.runs.keys()],
          finishedRuns: [...this.finishedRuns].map(
            ([assistantMessageId, assistantCompletedAt]) => ({
              assistantMessageId,
              assistantCompletedAt,
            }),
          ),
        },
      }),
    );

    // 刷新后重连时，若所有 run 都卡在 askuserquestions 等用户提交，
    // 之前广播的 chat_paused 该连接没收到，这里补一次，否则前端会一直卡在 streaming。
    const isPausedForAskUser =
      this.runtimeState.status === 'running' &&
      this.pendingAskUserQuestions.size > 0 &&
      this.pendingAskUserQuestions.size === this.runs.size;
    if (isPausedForAskUser) {
      ws.send(JSON.stringify({ event: 'chat_paused', data: {} }));
    }
  }

  webSocketClose() {
    // 连接生命周期归客户端管；runtime 自动把关闭的连接从 getWebSockets() 移除。
  }

  webSocketError(_ws: WebSocket, error: unknown) {
    log('AGENT', 'WebSocket error', { error: getErrorMessage(error) });
  }

  // ── POST /abort ──────────────────────────────────────────────────────

  // 中断运行中的请求。body 带 assistantMessageId 时只中断对应 run,不带则中断全部。
  // 返回 ok 只表示中断信号已经发出。
  private async handleAbort(request: Request, userId: string): Promise<Response> {
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    let rawBody: unknown = null;
    try {
      rawBody = await request.json();
    } catch {
      // 空 body 视为「中断全部」
    }
    const targetId =
      isObject(rawBody) && typeof rawBody.assistantMessageId === 'number'
        ? rawBody.assistantMessageId
        : null;

    if (targetId !== null) {
      this.runs.get(targetId)?.abortController.abort();
      return Response.json({ ok: true });
    }

    for (const run of this.runs.values()) {
      run.abortController.abort();
    }
    return Response.json({ ok: true });
  }

  private waitForAskUserQuestionsAnswer(
    conversationId: string,
    userId: string,
    callId: string,
    assistantMessageId: number,
    questions: AskUserQuestionsQuestion[],
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
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
        assistantMessageId,
        questions,
        submittedByUserId: null,
        answered: false,
        emitEvent,
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

    if (!pending.waitForAnswer) {
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

    await pending.emitEvent({
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
  // conversationHistory 由服务端从当前分支生成，这里只做业务级校验（非空、有有效用户消息）。

  /**
   * 从 HTTP 已解析的 body 构造「可跑模型」所需的一切：校验、选模型与 prompt、创建统一 ChatProvider、
   * 把 SerializedMessage[] 转成供应商内部消息格式（workingMessages）。
   * 任一步失败都会 emit error 事件并返回 null，调用方将 finalStatus 置为 error，不再进入主循环。
   */
  private async prepareContext(
    message: PreparedChatRequest,
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

    const backendConfig = getBackendConfig(modelConfig);

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
    message: PreparedChatRequest,
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

      // 所有 run 都在等用户提交时广播 chat_paused,前端据此切换 UI 状态。
      // WebSocket 连接保持打开(Hibernation),提交答案后事件从同一条连接继续。
      if (this.pendingAskUserQuestions.size + 1 === this.runs.size || this.runs.size === 1) {
        this.broadcast('chat_paused', {});
      }

      const modelResult = await this.waitForAskUserQuestionsAnswer(
        message.conversationId,
        userId,
        toolCall.id,
        message.assistantMessageId,
        questions,
        emitEvent,
        signal,
      );

      return {
        id: toolCall.id,
        name: toolCall.name,
        result: modelResult,
      };
    } catch (error) {
      if (isAbortError(error, signal)) {
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
    message: PreparedChatRequest,
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
   * 单个 run 的收尾:无论 try 成功、return 还是 catch,finally 都会执行。
   * - 拒绝本 run 仍在等待的 askuserquestions,避免 /tool-answer 误匹配。
   * - 非成功结束时为本 run 未完结 artifact 补发 failed(经 emitEvent,与正常事件同源)。
   * - 给本 run 的 assistant 打 completedAt,落共享树快照,广播 chat_finished。
   * - 只有最后一个收口的 run 负责:清事件缓存、释放共享树、置终态、重新生成标题。
   * runState 以对象传入,便于最终快照失败时把 finalStatus 纠正为 error。
   */
  private async finalize(
    runState: { finalStatus: Exclude<ChatAgentStatus, 'idle' | 'running'> },
    message: PreparedChatRequest,
    userId: string,
    artifactAccumulator: ArtifactAccumulator,
    emitEvent: (event: ChatServerToClientEvent) => Promise<void>,
  ) {
    for (const [callId, pending] of this.pendingAskUserQuestions) {
      if (pending.assistantMessageId !== message.assistantMessageId) continue;
      pending.waitForAnswer?.reject(new DOMException('Aborted', 'AbortError'));
      pending.waitForAnswer?.clearAbortListener();
      this.pendingAskUserQuestions.delete(callId);
    }

    if (runState.finalStatus !== 'completed') {
      const reason = runState.finalStatus === 'aborted' ? 'aborted' : 'error';
      for (const event of artifactAccumulator.drainPendingAsFailures(reason)) {
        await emitEvent(event);
      }
    }

    let assistantCompletedAt: string | null = null;
    const tree = this.activeTree;
    if (tree) {
      const assistant = tree.messages[message.assistantMessageId - 1];
      if (assistant && assistant.role === 'assistant') {
        assistantCompletedAt = new Date().toISOString();
        assistant.completedAt = assistantCompletedAt;
      }

      try {
        await this.persistConversationSnapshot(
          message.conversationId,
          userId,
          cloneTreeSnapshot(tree),
          message.runPath,
          message.model,
          runState.finalStatus === 'completed' && this.runs.size === 1,
        );
      } catch (error) {
        runState.finalStatus = 'error';
        log('AGENT', 'Persist final conversation snapshot failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.runs.delete(message.assistantMessageId);
    this.finishedRuns.set(message.assistantMessageId, assistantCompletedAt);
    const remainingRuns = this.runs.size;

    if (remainingRuns === 0) {
      this.runtimeState = {
        ...this.runtimeState,
        status: runState.finalStatus,
        updatedAt: Date.now(),
      };
    }

    const finishedPayload: ChatFinishedPayload = {
      assistantMessageId: message.assistantMessageId,
      status: runState.finalStatus,
      assistantCompletedAt,
      remainingRuns,
    };
    this.broadcast('chat_finished', finishedPayload);

    if (remainingRuns === 0) {
      this.eventCache = [];
      this.finishedRuns.clear();
      this.activeTree = null;
    }
  }

  /**
   * /chat 返回回执后，真正跑模型与工具的逻辑；与 HTTP handler 解耦，便于 waitUntil 后台执行。
   * emitEvent 是单一路由：先推进共享树(事件定点写本 run 的 assistant)、累计 error 条数、
   * artifact 副作用、再入缓存并 SSE。
   */
  private async runChatInBackground(
    message: PreparedChatRequest,
    userId: string,
    signal: AbortSignal,
  ) {
    const runState = { finalStatus: 'completed' as Exclude<ChatAgentStatus, 'idle' | 'running'> };
    let errorEventCount = 0;
    const artifactAccumulator = new ArtifactAccumulator(this.env, userId, message.conversationId);

    const emitEvent = async (event: ChatServerToClientEvent) => {
      if (this.activeTree) {
        this.activeTree = processEventToTree(this.activeTree, event, message.assistantMessageId);
      }
      if (event.type === 'error') {
        errorEventCount += 1;
      }
      await artifactAccumulator.handleEvent(event);
      this.persistAndBroadcastEvent(event, message.assistantMessageId);
    };

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

        // 长链路 tool-use 中途崩溃时，中间快照能保住已生成的树状态；标题统一在最终快照生成一次。
        try {
          if (this.activeTree) {
            await this.persistConversationSnapshot(
              message.conversationId,
              userId,
              cloneTreeSnapshot(this.activeTree),
              message.runPath,
              message.model,
              false,
            );
          }
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
      if (isAbortError(error, signal)) {
        runState.finalStatus = 'aborted';
      } else {
        runState.finalStatus = 'error';
        const errorMessage = error instanceof Error ? error.message : String(error);
        await emitEvent(toEventError(`错误：${errorMessage}`));
      }
    } finally {
      // 始终收口：清理交互状态、补 artifact、最终落库、广播结束;最后一个 run 额外负责全局收尾。
      await this.finalize(runState, message, userId, artifactAccumulator, emitEvent);
    }
  }

  // ── Event cache ──────────────────────────────────────────────────────

  private listEvents(lastEventId: number): PersistedChatEvent[] {
    return this.eventCache.filter((e) => e.eventId > lastEventId);
  }

  private persistAndBroadcastEvent(
    event: ChatServerToClientEvent,
    assistantMessageId: number | null,
  ) {
    const eventId = this.nextEventId++;
    const createdAt = Date.now();

    this.eventCache.push({ eventId, event, assistantMessageId, createdAt });
    this.broadcast('chat_event', { eventId, event, assistantMessageId });
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private async persistConversationSnapshot(
    conversationId: string,
    userId: string,
    snapshot: MessageTreeSnapshot,
    runPath: number[],
    model?: string,
    regenerateTitle = false,
  ) {
    const existing = await getConversationById(this.env.DB, conversationId, userId);
    const now = new Date().toISOString();

    let resolvedTitle = existing?.title ?? 'New Chat';

    if (regenerateTitle) {
      // 标题生成只基于本 run 路径上真正可见的正文内容，不包含工具中间态或空块。
      const conversationTranscript = extractConversationTranscript(snapshot.messages, runPath);

      if (conversationTranscript) {
        resolvedTitle = await generateTitleFromConversation(conversationTranscript);
      }
    }

    await upsertConversation(this.env.DB, {
      user_id: userId,
      id: conversationId,
      title: resolvedTitle,
      model: model ?? existing?.model ?? null,
      messages: snapshot.messages,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });

    // 标题和更新时间变更后同步广播，让侧边栏列表和当前会话页保持一致。
    this.persistAndBroadcastEvent(
      {
        type: 'conversation_updated',
        conversationId,
        title: resolvedTitle,
        updated_at: now,
      },
      null,
    );
  }
}
