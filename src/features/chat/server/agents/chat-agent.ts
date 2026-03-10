import { DurableObject } from 'cloudflare:workers'
import { getAvailableTools, executeToolsGen } from '@/server/agents/tools/executor'
import {
  getDefaultModelConfig,
  getModelConfig,
  getBackendConfig,
  getPromptById,
  getDefaultPromptId,
} from '@/server/agents/services/chat-config'
import { log } from '@/server/agents/services/logger'
import { createChatProvider } from '@/server/agents/services/provider-factory'
import type { ProviderRunResult } from '@/server/agents/services/provider-types'
import { generateTitleFromConversation } from '@/server/functions/chat/chat-title'
import { stripTransientSearchDataFromMessages } from '@/lib/chat/search-result-payload'
import { processEventToTree, cloneTreeSnapshot } from '@/server/agents/services/event-processor'
import {
  getConversationById,
  upsertConversation,
} from '@/server/db/conversations-db'
import { consumePromptQuotaOnAccept } from '@/server/db/prompt-quota-db'
import type {
  ChatAgentStatus,
  ChatServerToClientEvent,
  MessageTreeSnapshot,
  PendingToolInvocation,
  PersistedChatEvent,
  ToolInvocationResult,
} from '@/types/chat-api'
import type { Message, SerializedMessage } from '@/types/message'

type ChatAgentState = {
  status: ChatAgentStatus
  currentRequestId: string | null
  conversationId: string | null
  ownerUserId: string | null
  updatedAt: number
}

type ChatAgentEnv = Cloudflare.Env & {
  DB: D1Database
  CHAT_ASSETS: R2Bucket
  ANTHROPIC_API_KEY_RIGHTCODE?: string
  ANTHROPIC_BASE_URL_RIGHTCODE?: string
  ANTHROPIC_API_KEY_IKUNCODE?: string
  ANTHROPIC_BASE_URL_IKUNCODE?: string
  DMX_APIKEY?: string
  DMX_BASEURL?: string
  JINA_API_KEY?: string
  SERP_API_KEY?: string
  SUPADATA_API_KEY?: string
}

const MAX_ITERATIONS = 200

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

const MAX_TITLE_TRANSCRIPT_CHARS = 4_000

const extractConversationTranscript = (messages: Message[], currentPath: number[]) => {
  const lines = currentPath
    .map((id) => messages[id - 1])
    .filter((message): message is Message => Boolean(message))
    .map((message) => {
      const text = message.blocks
        .filter((block): block is Extract<typeof block, { type: 'content' }> => block.type === 'content')
        .map((block) => block.content)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!text) {
        return null
      }

      const speaker = message.role === 'user' ? 'User' : 'Assistant'
      return `${speaker}: ${text}`
    })
    .filter((line): line is string => Boolean(line))

  if (lines.length === 0) {
    return ''
  }

  return lines.join('\n').slice(-MAX_TITLE_TRANSCRIPT_CHARS)
}

const toEventError = (message: string): ChatServerToClientEvent => ({
  type: 'error',
  message,
})

type ChatRequestBody = {
  requestId: string
  conversationId: string
  role: string
  promptId?: string
  conversationHistory: SerializedMessage[]
  treeSnapshot: MessageTreeSnapshot
}

const parseChatRequestBody = (body: unknown): ChatRequestBody | null => {
  if (!isObject(body)) return null

  const requestId = asString(body.requestId)
  const conversationId = asString(body.conversationId)
  const role = asString(body.role)
  const promptId = asString(body.promptId) ?? undefined
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? (body.conversationHistory as SerializedMessage[])
    : null
  const treeSnapshot = isObject(body.treeSnapshot) ? body.treeSnapshot : null

  const snapshotMessages =
    treeSnapshot && Array.isArray(treeSnapshot.messages)
      ? (treeSnapshot.messages as Message[])
      : null
  const snapshotPath =
    treeSnapshot && Array.isArray(treeSnapshot.currentPath)
      ? treeSnapshot.currentPath.filter((id): id is number => typeof id === 'number')
      : null
  const snapshotLatestRootId =
    treeSnapshot &&
    (typeof treeSnapshot.latestRootId === 'number' || treeSnapshot.latestRootId === null)
      ? treeSnapshot.latestRootId
      : null
  const snapshotNextId =
    treeSnapshot && typeof treeSnapshot.nextId === 'number' ? treeSnapshot.nextId : null

  if (
    !requestId ||
    !conversationId ||
    !role ||
    !conversationHistory ||
    !snapshotMessages ||
    !snapshotPath ||
    snapshotNextId === null
  ) {
    return null
  }

  return {
    requestId,
    conversationId,
    role,
    promptId,
    conversationHistory,
    treeSnapshot: {
      messages: snapshotMessages,
      currentPath: snapshotPath,
      latestRootId: snapshotLatestRootId,
      nextId: snapshotNextId,
    },
  }
}

export class ChatAgent extends DurableObject<ChatAgentEnv> {
  private instanceName: string | null = null

  private abortController: AbortController | null = null
  private eventCache: PersistedChatEvent[] = []
  private nextEventId = 1
  private eventCacheClearTimer: ReturnType<typeof setTimeout> | null = null
  private runtimeState: ChatAgentState = {
    status: 'idle',
    currentRequestId: null,
    conversationId: null,
    ownerUserId: null,
    updatedAt: Date.now(),
  }

  // SSE subscriber streams
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>()
  private encoder = new TextEncoder()

  private ensureInitialized(name: string) {
    if (!this.instanceName) {
      this.instanceName = name
      this.runtimeState.conversationId = name
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    // Extract instance name and sub-path from URL: /agents/chat-agent/<name>[/<sub>]
    const segments = url.pathname.split('/')
    const nameIndex = segments.indexOf('chat-agent')
    const name = nameIndex >= 0 && segments.length > nameIndex + 1
      ? segments[nameIndex + 1]
      : null

    if (name) {
      this.ensureInitialized(name)
    }

    const sub = nameIndex >= 0 && segments.length > nameIndex + 2
      ? segments[nameIndex + 2]
      : ''

    const userId = request.headers.get('x-aether-user-id')?.trim() ?? null

    if (request.method === 'POST' && sub === 'chat') {
      if (!userId) return new Response('Unauthorized', { status: 401 })
      return this.handleChat(request, userId)
    }

    if (request.method === 'GET' && sub === 'events') {
      if (!userId) return new Response('Unauthorized', { status: 401 })
      return this.handleEvents(request, userId)
    }

    if (request.method === 'POST' && sub === 'abort') {
      if (!userId) return new Response('Unauthorized', { status: 401 })
      return this.handleAbort(request, userId)
    }

    // Status probe
    if (request.method === 'GET' && sub === '') {
      return Response.json({
        status: this.runtimeState.status,
        requestId: this.runtimeState.currentRequestId ?? undefined,
      })
    }

    return new Response('Not found', { status: 404 })
  }

  // ── SSE helpers ──────────────────────────────────────────────────────

  private sendSSE(writer: WritableStreamDefaultWriter<Uint8Array>, event: string, data: unknown) {
    writer.write(this.encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      .catch(() => this.writers.delete(writer))
  }

  private broadcast(event: string, data: unknown) {
    for (const w of this.writers) {
      this.sendSSE(w, event, data)
    }
  }

  // ── POST /chat ───────────────────────────────────────────────────────

  private async handleChat(request: Request, userId: string): Promise<Response> {
    const rawBody = await request.json().catch(() => null)
    const message = parseChatRequestBody(rawBody)

    if (!message) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (this.runtimeState.status === 'running' && this.runtimeState.currentRequestId) {
      return Response.json(
        { type: 'busy', currentRequestId: this.runtimeState.currentRequestId },
        { status: 409 },
      )
    }

    if (message.conversationId !== this.instanceName) {
      return Response.json(
        { error: 'Conversation ID mismatch' },
        { status: 400 },
      )
    }

    // Ensure owner
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 })
    }
    if (!this.runtimeState.ownerUserId) {
      this.runtimeState = { ...this.runtimeState, ownerUserId: userId }
    }

    // Starting a new request: clear stale cache
    this.cancelEventCacheClear()
    this.eventCache = []

    const consumeResult = await consumePromptQuotaOnAccept(
      this.env.DB,
      userId,
      message.requestId,
    )
    if (!consumeResult.ok) {
      let errorMessage: string
      if (consumeResult.reason === 'insufficient') {
        errorMessage = '额度不足，请使用兑换码获取更多 prompt 额度'
      } else {
        errorMessage = `请求失败：${consumeResult.message}`
      }
      return Response.json(
        { type: 'quota_error', message: errorMessage },
        { status: 402 },
      )
    }

    // Set running state
    this.runtimeState = {
      status: 'running',
      currentRequestId: message.requestId,
      conversationId: message.conversationId,
      ownerUserId: this.runtimeState.ownerUserId ?? userId,
      updatedAt: Date.now(),
    }

    // Create SSE stream for this request
    const { readable, writable } = new TransformStream<Uint8Array>()
    const writer = writable.getWriter()
    this.writers.add(writer)

    this.broadcast('chat_started', { requestId: message.requestId })

    // Persist user message snapshot
    try {
      const existing = await getConversationById(this.env.DB, message.conversationId, userId)
      const now = new Date().toISOString()
      const title = existing?.title ?? 'New Chat'

      await upsertConversation(this.env.DB, {
        user_id: userId,
        id: message.conversationId,
        title,
        role: message.role ?? existing?.role ?? null,
        currentPath: message.treeSnapshot.currentPath,
        messages: message.treeSnapshot.messages as unknown as object[],
        created_at: existing?.created_at ?? now,
        updated_at: now,
      })

      this.broadcast('conversation_update', {
        conversationId: message.conversationId,
        title,
        updated_at: now,
      })
    } catch (error) {
      log('AGENT', 'User message persist failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const task = this.runChatInBackground(message, userId, signal)
      .catch((error) => {
        log('AGENT', 'runChatInBackground failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        this.abortController = null
        writer.close().catch(() => {})
        this.writers.delete(writer)
      })

    this.ctx.waitUntil(task)

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // ── GET /events ──────────────────────────────────────────────────────

  private handleEvents(request: Request, userId: string): Response {
    const url = new URL(request.url)
    const lastEventId = Number(url.searchParams.get('lastEventId') ?? 0)

    // Ensure owner
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 })
    }
    if (!this.runtimeState.ownerUserId) {
      this.runtimeState = { ...this.runtimeState, ownerUserId: userId }
    }

    const { readable, writable } = new TransformStream<Uint8Array>()
    const writer = writable.getWriter()

    // Send sync data
    const events = this.listEvents(lastEventId)
    this.sendSSE(writer, 'sync_response', {
      status: this.runtimeState.status,
      requestId: this.runtimeState.currentRequestId ?? undefined,
      events,
    })

    if (this.runtimeState.status === 'running') {
      // Keep connection open to receive future events
      this.writers.add(writer)
    } else {
      // Not running — write sync data and close
      writer.close().catch(() => {})
    }

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // ── POST /abort ──────────────────────────────────────────────────────

  private async handleAbort(request: Request, userId: string): Promise<Response> {
    if (this.runtimeState.ownerUserId && this.runtimeState.ownerUserId !== userId) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const requestId = asString(body.requestId) ?? undefined

    if (this.runtimeState.status !== 'running' || !this.abortController) {
      return Response.json({ ok: true })
    }

    if (requestId && this.runtimeState.currentRequestId && requestId !== this.runtimeState.currentRequestId) {
      return Response.json({ ok: true })
    }

    this.abortController.abort()
    return Response.json({ ok: true })
  }

  // ── Background chat execution ────────────────────────────────────────

  private async runChatInBackground(
    message: ChatRequestBody,
    userId: string,
    signal: AbortSignal,
  ) {
    let finalStatus: Exclude<ChatAgentStatus, 'idle' | 'running'> = 'completed'
    let workingTree = cloneTreeSnapshot(message.treeSnapshot)
    let hasErrorEvent = false

    const emitEvent = async (event: ChatServerToClientEvent) => {
      workingTree = processEventToTree(workingTree, event)
      if (event.type === 'error') {
        hasErrorEvent = true
      }
      this.persistAndBroadcastEvent(message.requestId, event)
    }

    try {
      const { conversationHistory, role, promptId } = message

      if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
        await emitEvent(toEventError('Invalid conversation history: expected non-empty array.'))
        finalStatus = 'error'
        return
      }

      const latestUserMessage = [...conversationHistory].reverse().find((item) => item.role === 'user')
      if (!latestUserMessage || !Array.isArray(latestUserMessage.blocks) || latestUserMessage.blocks.length === 0) {
        await emitEvent(
          toEventError('Missing user message: latest user message missing or has empty blocks.'),
        )
        finalStatus = 'error'
        return
      }

      const modelConfig = role ? getModelConfig(role) : getDefaultModelConfig()
      if (!modelConfig) {
        await emitEvent(toEventError(`Invalid or missing role: "${String(role ?? '')}".`))
        finalStatus = 'error'
        return
      }

      const promptConfig =
        promptId ? getPromptById(promptId) : getPromptById(getDefaultPromptId())
      const systemPrompt = promptConfig?.content ?? ''

      const normalizedHistory = stripTransientSearchDataFromMessages(
        conversationHistory.map((m) => ({
          ...m,
          blocks: Array.isArray(m.blocks) ? m.blocks : [],
        } as SerializedMessage)),
      )

      let iteration = 0

      const backendConfig = getBackendConfig(modelConfig.backend)

      const provider = createChatProvider(modelConfig.format, {
        model: modelConfig.model,
        backendConfig,
        tools: getAvailableTools(),
        systemPrompt,
      })

      let workingMessages = await provider.convertMessages(normalizedHistory)

      while (iteration < MAX_ITERATIONS) {
        if (signal.aborted) {
          finalStatus = 'aborted'
          break
        }

        iteration += 1
        const generator = provider.run(workingMessages, signal)

        let pendingToolCalls: PendingToolInvocation[] = []
        let assistantText = ''
        let runResult: ProviderRunResult = { pendingToolCalls, thinkingBlocks: [] }

        while (true) {
          const { done, value } = await generator.next()
          if (done) {
            runResult = value
            pendingToolCalls = value.pendingToolCalls
            break
          }

          if (value.type === 'content') {
            assistantText += value.content
          }

          await emitEvent(value)

          if (signal.aborted) {
            finalStatus = 'aborted'
            break
          }
        }

        if (signal.aborted) {
          finalStatus = 'aborted'
          break
        }

        if (pendingToolCalls.length === 0) {
          break
        }

        const toolGen = executeToolsGen(pendingToolCalls, signal)
        let toolResults: ToolInvocationResult[] = []

        while (true) {
          const toolGenResult = await toolGen.next()
          if (toolGenResult.done) {
            toolResults = toolGenResult.value
            break
          }
          await emitEvent(toolGenResult.value)

          if (signal.aborted) {
            finalStatus = 'aborted'
            break
          }
        }

        if (signal.aborted) {
          finalStatus = 'aborted'
          break
        }

        const continuationMessages = provider.formatToolContinuation(
          assistantText,
          runResult,
          pendingToolCalls,
          toolResults,
        )
        workingMessages = [...workingMessages, ...continuationMessages]
      }

      if (iteration >= MAX_ITERATIONS && finalStatus === 'completed') {
        await emitEvent(
          toEventError(
            `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${MAX_ITERATIONS} model=${modelConfig.model}`,
          ),
        )
        finalStatus = 'error'
      }

      if (hasErrorEvent && finalStatus === 'completed') {
        finalStatus = 'error'
      }
    } catch (error) {
      const isAbortError =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal.aborted

      if (isAbortError) {
        finalStatus = 'aborted'
      } else {
        finalStatus = 'error'
        const errorMessage = error instanceof Error ? error.message : String(error)
        await emitEvent(toEventError(`错误：${errorMessage}`))
      }
    } finally {
      try {
        await this.persistConversationSnapshot(
          message.conversationId,
          userId,
          cloneTreeSnapshot(workingTree),
          message.role,
          finalStatus === 'completed',
        )
      } catch (error) {
        finalStatus = 'error'
        log('AGENT', 'Persist final conversation snapshot failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      this.broadcast('chat_finished', {
        requestId: message.requestId,
        status: finalStatus,
      })

      this.runtimeState = {
        ...this.runtimeState,
        status: finalStatus,
        updatedAt: Date.now(),
      }

      this.scheduleEventCacheClear(message.requestId)
    }
  }

  // ── Event cache ──────────────────────────────────────────────────────

  private listEvents(lastEventId: number): PersistedChatEvent[] {
    return this.eventCache.filter((e) => e.eventId > lastEventId)
  }

  private persistAndBroadcastEvent(requestId: string, event: ChatServerToClientEvent) {
    const eventId = this.nextEventId++
    const createdAt = Date.now()

    this.eventCache.push({ eventId, requestId, event, createdAt })

    this.broadcast('chat_event', { eventId, requestId, event })
  }

  private cancelEventCacheClear() {
    if (!this.eventCacheClearTimer) {
      return
    }

    clearTimeout(this.eventCacheClearTimer)
    this.eventCacheClearTimer = null
  }

  private scheduleEventCacheClear(requestId: string) {
    this.cancelEventCacheClear()

    this.eventCacheClearTimer = setTimeout(() => {
      this.eventCacheClearTimer = null

      // If a new request started since scheduling, don't clear its cache.
      if (this.runtimeState.currentRequestId !== requestId) {
        return
      }

      // A running request still needs the cache for reconnect/sync.
      if (this.runtimeState.status === 'running') {
        return
      }

      this.eventCache = []
    }, 30_000)
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private async persistConversationSnapshot(
    conversationId: string,
    userId: string,
    snapshot: {
      messages: Message[]
      currentPath: number[]
      latestRootId: number | null
      nextId: number
    },
    role?: string,
    regenerateTitle = false,
  ) {
    const existing = await getConversationById(this.env.DB, conversationId, userId)
    const now = new Date().toISOString()

    let resolvedTitle = existing?.title ?? 'New Chat'

    if (regenerateTitle) {
      const conversationTranscript = extractConversationTranscript(
        snapshot.messages,
        snapshot.currentPath,
      )

      if (conversationTranscript) {
        resolvedTitle = await generateTitleFromConversation(conversationTranscript)
      }
    }

    await upsertConversation(this.env.DB, {
      user_id: userId,
      id: conversationId,
      title: resolvedTitle,
      role: role ?? existing?.role ?? null,
      currentPath: snapshot.currentPath,
      messages: snapshot.messages as unknown as object[],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    })

    this.broadcast('conversation_update', {
      conversationId,
      title: resolvedTitle,
      updated_at: now,
    })
  }
}
