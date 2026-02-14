import { Agent, type Connection } from 'agents'
import { getAvailableTools, executeToolsGen } from '@/features/chat/api/server/tools/executor'
import {
  getDefaultRoleConfig,
  getRoleConfig,
} from '@/features/chat/api/server/services/chat-config'
import {
  createConversationLogger,
  enterLoggerContext,
  getLogger,
} from '@/features/chat/api/server/services/logger'
import {
  AnthropicChatProvider,
  convertToAnthropicMessages,
  formatToolContinuation,
  type ThinkingBlockData,
} from '@/features/chat/api/server/services/anthropic'
import { generateTitleFromUserMessage } from '@/features/chat/api/server/functions/chat-title'
import { processEventToTree, cloneTreeSnapshot } from '@/features/chat/api/server/services/event-processor'
import {
  getConversationById,
  upsertConversation,
} from '@/features/conversation/persistence/server/services/conversations-db'
import type {
  ChatAgentClientMessage,
  ChatAgentServerMessage,
  ChatAgentStatus,
  ChatServerToClientEvent,
  PendingToolInvocation,
  PersistedChatEvent,
  ToolInvocationResult,
} from '@/features/chat/api/shared/types'
import type { Message, SerializedMessage } from '@/features/chat/types/chat'

type ChatAgentState = {
  status: ChatAgentStatus
  currentRequestId: string | null
  conversationId: string | null
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

const parseMessage = (message: unknown): ChatAgentClientMessage | null => {
  if (typeof message !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(message)
    if (!isObject(parsed) || typeof parsed.type !== 'string') {
      return null
    }

    if (parsed.type === 'sync') {
      const conversationId = asString(parsed.conversationId)
      if (!conversationId) {
        return null
      }

      return {
        type: 'sync',
        conversationId,
        lastEventId: typeof parsed.lastEventId === 'number' ? parsed.lastEventId : undefined,
      }
    }

    if (parsed.type === 'abort') {
      return {
        type: 'abort',
        requestId: asString(parsed.requestId) ?? undefined,
      }
    }

    if (parsed.type === 'chat_request') {
      const requestId = asString(parsed.requestId)
      const conversationId = asString(parsed.conversationId)
      const role = asString(parsed.role)
      const conversationHistory = Array.isArray(parsed.conversationHistory)
        ? (parsed.conversationHistory as SerializedMessage[])
        : null
      const treeSnapshot = isObject(parsed.treeSnapshot) ? parsed.treeSnapshot : null

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
        type: 'chat_request',
        requestId,
        conversationId,
        role,
        conversationHistory,
        treeSnapshot: {
          messages: snapshotMessages,
          currentPath: snapshotPath,
          latestRootId: snapshotLatestRootId,
          nextId: snapshotNextId,
        },
      }
    }

    return null
  } catch {
    return null
  }
}

const stringify = (payload: unknown) => JSON.stringify(payload)

const extractLatestUserText = (messages: Message[], currentPath: number[]) => {
  const pathIds = [...currentPath].reverse()
  for (const id of pathIds) {
    const message = messages[id - 1]
    if (!message || message.role !== 'user') {
      continue
    }

    const text = message.blocks
      .filter((block) => block.type === 'content')
      .map((block) => block.content)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (text) {
      return text
    }
  }

  return ''
}

const toEventError = (message: string): ChatServerToClientEvent => ({
  type: 'error',
  message,
})

export class ChatAgent extends Agent<ChatAgentEnv, ChatAgentState> {
  initialState: ChatAgentState = {
    status: 'idle',
    currentRequestId: null,
    conversationId: null,
    updatedAt: Date.now(),
  }

  private abortController: AbortController | null = null
  private eventCache: PersistedChatEvent[] = []
  private nextEventId = 1
  private runtimeState: ChatAgentState = { ...this.initialState }

  async onStart() {
    this.runtimeState.conversationId = this.name
  }

  async onConnect(connection: Connection) {
    connection.send(
      stringify({
        type: 'sync_response',
        status: this.runtimeState.status,
        requestId: this.runtimeState.currentRequestId ?? undefined,
        events: [],
      } satisfies ChatAgentServerMessage),
    )
  }

  async onMessage(connection: Connection, rawMessage: unknown) {
    const parsed = parseMessage(rawMessage)
    if (!parsed) {
      return
    }

    if (parsed.type === 'sync') {
      await this.handleSync(connection, parsed)
      return
    }

    if (parsed.type === 'abort') {
      this.handleAbort(parsed)
      return
    }

    if (parsed.type === 'chat_request') {
      await this.handleChatRequest(connection, parsed)
    }
  }

  private async handleSync(
    connection: Connection,
    message: Extract<ChatAgentClientMessage, { type: 'sync' }>,
  ) {
    const lastEventId =
      typeof message.lastEventId === 'number' && Number.isFinite(message.lastEventId)
        ? Math.max(0, Math.floor(message.lastEventId))
        : 0

    const events = this.listEvents(lastEventId)

    connection.send(
      stringify({
        type: 'sync_response',
        status: this.runtimeState.status,
        requestId: this.runtimeState.currentRequestId ?? undefined,
        events,
      } satisfies ChatAgentServerMessage),
    )
  }

  private async handleChatRequest(
    connection: Connection,
    message: Extract<ChatAgentClientMessage, { type: 'chat_request' }>,
  ) {
    if (this.runtimeState.status === 'running' && this.runtimeState.currentRequestId) {
      connection.send(
        stringify({
          type: 'busy',
          currentRequestId: this.runtimeState.currentRequestId,
        } satisfies ChatAgentServerMessage),
      )
      return
    }

    if (message.conversationId !== this.name) {
      connection.send(
        stringify({
          type: 'chat_finished',
          requestId: message.requestId,
          status: 'error',
        } satisfies ChatAgentServerMessage),
      )
      return
    }

    this.runtimeState = {
      status: 'running',
      currentRequestId: message.requestId,
      conversationId: message.conversationId,
      updatedAt: Date.now(),
    }

    this.broadcast(
      stringify({
        type: 'chat_started',
        requestId: message.requestId,
      } satisfies ChatAgentServerMessage),
    )

    // Persist initial D1 record so the conversation exists before streaming starts
    try {
      const existing = await getConversationById(this.env.DB, message.conversationId)
      if (!existing) {
        const now = new Date().toISOString()
        const userText = extractLatestUserText(
          message.treeSnapshot.messages,
          message.treeSnapshot.currentPath,
        )
        const initialTitle = userText.length > 60
          ? userText.slice(0, 60) + '…'
          : userText || 'New Chat'

        await upsertConversation(this.env.DB, {
          id: message.conversationId,
          title: initialTitle,
          currentPath: message.treeSnapshot.currentPath,
          messages: message.treeSnapshot.messages as unknown as object[],
          created_at: now,
          updated_at: now,
        })

        this.broadcast(
          stringify({
            type: 'conversation_update',
            conversationId: message.conversationId,
            title: initialTitle,
            updated_at: now,
          } satisfies ChatAgentServerMessage),
        )
      }
    } catch (error) {
      getLogger().log('AGENT', 'Initial conversation persist failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const task = this.runChatInBackground(message, signal)
      .catch((error) => {
        getLogger().log('AGENT', 'runChatInBackground failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        this.abortController = null
      })

    this.ctx.waitUntil(task)
  }

  private handleAbort(message: Extract<ChatAgentClientMessage, { type: 'abort' }>) {
    if (this.runtimeState.status !== 'running' || !this.abortController) {
      return
    }

    if (message.requestId && this.runtimeState.currentRequestId && message.requestId !== this.runtimeState.currentRequestId) {
      return
    }

    this.abortController.abort()
  }

  private async runChatInBackground(
    message: Extract<ChatAgentClientMessage, { type: 'chat_request' }>,
    signal: AbortSignal,
  ) {
    const logger = createConversationLogger()
    enterLoggerContext(logger)

    let finalStatus: Exclude<ChatAgentStatus, 'idle' | 'running'> = 'completed'
    let workingTree = cloneTreeSnapshot(message.treeSnapshot)
    let hasErrorEvent = false
    let snapshotPersistQueue: Promise<void> = Promise.resolve()

    const enqueueSnapshotPersist = () => {
      const snapshot = cloneTreeSnapshot(workingTree)
      snapshotPersistQueue = snapshotPersistQueue.then(async () => {
        try {
          await this.persistConversationSnapshot(message.conversationId, snapshot)
        } catch (error) {
          getLogger().log('AGENT', 'Persist conversation iteration snapshot failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    }

    const emitEvent = async (event: ChatServerToClientEvent) => {
      workingTree = processEventToTree(workingTree, event)
      if (event.type === 'error') {
        hasErrorEvent = true
      }
      this.persistAndBroadcastEvent(message.requestId, event)
    }

    try {
      const { conversationHistory, role } = message

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

      const roleConfig = role ? getRoleConfig(role) : getDefaultRoleConfig()
      if (!roleConfig) {
        await emitEvent(toEventError(`Invalid or missing role: "${String(role ?? '')}".`))
        finalStatus = 'error'
        return
      }

      const provider = new AnthropicChatProvider({
        model: roleConfig.model,
        backend: roleConfig.backend,
        tools: getAvailableTools(),
        systemPrompt: roleConfig.systemPrompt,
      })

      let workingMessages = await convertToAnthropicMessages(
        conversationHistory.map((m) => ({
          ...m,
          blocks: Array.isArray(m.blocks) ? m.blocks : [],
        } as SerializedMessage)),
      )

      let iteration = 0

      while (iteration < MAX_ITERATIONS) {
        if (signal.aborted) {
          finalStatus = 'aborted'
          break
        }

        iteration += 1
        try {
          const generator = provider.run(workingMessages, signal)

          let pendingToolCalls: PendingToolInvocation[] = []
          let thinkingBlocks: ThinkingBlockData[] = []
          let assistantText = ''

          while (true) {
            const { done, value } = await generator.next()
            if (done) {
              pendingToolCalls = value.pendingToolCalls
              thinkingBlocks = value.thinkingBlocks
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

          const continuationMessages = formatToolContinuation(
            assistantText,
            thinkingBlocks,
            pendingToolCalls,
            toolResults,
          )
          workingMessages = [...workingMessages, ...continuationMessages]
        } finally {
          enqueueSnapshotPersist()
        }
      }

      if (iteration >= MAX_ITERATIONS && finalStatus === 'completed') {
        await emitEvent(
          toEventError(
            `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${MAX_ITERATIONS} model=${roleConfig.model}`,
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
        await snapshotPersistQueue
      } catch (error) {
        getLogger().log('AGENT', 'Iteration snapshot queue failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      try {
        await this.persistConversationSnapshot(
          message.conversationId,
          cloneTreeSnapshot(workingTree),
        )
      } catch (error) {
        finalStatus = 'error'
        getLogger().log('AGENT', 'Persist final conversation snapshot failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      this.broadcast(
        stringify({
          type: 'chat_finished',
          requestId: message.requestId,
          status: finalStatus,
        } satisfies ChatAgentServerMessage),
      )

      this.runtimeState = {
        ...this.runtimeState,
        status: finalStatus,
        updatedAt: Date.now(),
      }

      this.clearEventCache()
    }
  }

  private listEvents(lastEventId: number): PersistedChatEvent[] {
    return this.eventCache.filter((e) => e.eventId > lastEventId)
  }

  private persistAndBroadcastEvent(requestId: string, event: ChatServerToClientEvent) {
    const eventId = this.nextEventId++
    const createdAt = Date.now()

    this.eventCache.push({ eventId, requestId, event, createdAt })

    this.broadcast(
      stringify({
        type: 'chat_event',
        eventId,
        requestId,
        event,
      } satisfies ChatAgentServerMessage),
    )
  }

  private clearEventCache() {
    this.eventCache = []
    this.nextEventId = 1
  }

  private async persistConversationSnapshot(
    conversationId: string,
    snapshot: {
      messages: Message[]
      currentPath: number[]
      latestRootId: number | null
      nextId: number
    },
  ) {
    const existing = await getConversationById(this.env.DB, conversationId)
    const now = new Date().toISOString()

    const latestUserText = extractLatestUserText(snapshot.messages, snapshot.currentPath)
    const generatedTitle = latestUserText
      ? await generateTitleFromUserMessage(latestUserText)
      : 'New Chat'

    await upsertConversation(this.env.DB, {
      id: conversationId,
      title: existing?.title ?? generatedTitle,
      currentPath: snapshot.currentPath,
      messages: snapshot.messages as unknown as object[],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    })

    const resolvedTitle = existing?.title ?? generatedTitle
    this.broadcast(
      stringify({
        type: 'conversation_update',
        conversationId,
        title: resolvedTitle,
        updated_at: now,
      } satisfies ChatAgentServerMessage),
    )
  }
}
