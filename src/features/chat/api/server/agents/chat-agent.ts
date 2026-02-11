import { Agent, type Connection } from 'agents'
import { fetchUrlTool } from '@/features/chat/api/server/tools/fetch'
import { searchTool } from '@/features/chat/api/server/tools/search'
import {
  getDefaultRoleConfig,
  getRoleConfig,
} from '@/features/chat/api/server/services/chat-config'
import {
  createConversationLogger,
  enterLoggerContext,
  getLogger,
} from '@/features/chat/api/server/services/logger'
import { runAnthropicChat } from '@/features/chat/api/server/services/anthropic'
import { executeToolsGen } from '@/features/chat/api/server/tools/execute'
import { generateTitleFromUserMessage } from '@/features/chat/api/server/functions/chat-title'
import { applyServerEventToTree, cloneTreeSnapshot } from '@/features/chat/api/server/services/tree-accumulator'
import {
  getConversationById,
  upsertConversation,
} from '@/features/conversation/persistence/server/services/conversations-db'
import type {
  ChatAgentClientMessage,
  ChatAgentServerMessage,
  ChatAgentStatus,
  ChatRequestConfig,
  ChatRunResult,
  ChatProviderState,
  ChatServerToClientEvent,
  PersistedChatEvent,
  ToolInvocationResult,
} from '@/features/chat/api/types/schemas/types'
import type { ChatTool } from '@/features/chat/api/server/tools/types'
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
  JINA_API_KEY?: string
  SERP_API_KEY?: string
  SUPADATA_API_KEY?: string
}

type PersistedEventRow = {
  id: number
  request_id: string
  event_json: string
  created_at: number
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

  async onStart() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `

    void this.sql`CREATE INDEX IF NOT EXISTS idx_events_request_id ON events(request_id)`

    if (!this.state.conversationId) {
      this.setState({
        ...this.state,
        conversationId: this.name,
        updatedAt: Date.now(),
      })
    }
  }

  async onConnect(connection: Connection) {
    connection.send(
      stringify({
        type: 'sync_response',
        status: this.state.status,
        requestId: this.state.currentRequestId ?? undefined,
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
        status: this.state.status,
        requestId: this.state.currentRequestId ?? undefined,
        events,
      } satisfies ChatAgentServerMessage),
    )
  }

  private async handleChatRequest(
    connection: Connection,
    message: Extract<ChatAgentClientMessage, { type: 'chat_request' }>,
  ) {
    if (this.state.status === 'running' && this.state.currentRequestId) {
      connection.send(
        stringify({
          type: 'busy',
          currentRequestId: this.state.currentRequestId,
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

    this.setState({
      ...this.state,
      status: 'running',
      currentRequestId: message.requestId,
      conversationId: message.conversationId,
      updatedAt: Date.now(),
    })

    this.broadcast(
      stringify({
        type: 'chat_started',
        requestId: message.requestId,
      } satisfies ChatAgentServerMessage),
    )

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
    if (this.state.status !== 'running' || !this.abortController) {
      return
    }

    if (message.requestId && this.state.currentRequestId && message.requestId !== this.state.currentRequestId) {
      return
    }

    this.abortController.abort()
  }

  private buildTools() {
    const tools: ChatTool[] = []
    if (this.env.JINA_API_KEY) {
      tools.push(fetchUrlTool.spec)
    }
    if (this.env.SERP_API_KEY) {
      tools.push(searchTool.spec)
    }
    return tools
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

    const emitEvent = async (event: ChatServerToClientEvent) => {
      workingTree = applyServerEventToTree(workingTree, event)
      if (event.type === 'error') {
        hasErrorEvent = true
      }
      this.persistAndBroadcastEvent(message.requestId, event)
    }

    try {
      const { conversationHistory, role } = message

      const messageCount = Array.isArray(conversationHistory) ? conversationHistory.length : 0
      getLogger().log('AGENT', 'Received chat_request', {
        conversationId: message.conversationId,
        requestId: message.requestId,
        role,
        messageCount,
      })

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

      const chatRequestConfig: ChatRequestConfig = {
        model: roleConfig.model,
        backend: roleConfig.backend,
        systemPrompt: roleConfig.systemPrompt,
        tools: this.buildTools(),
        messages: conversationHistory.map((historyMessage) => ({
          ...historyMessage,
          blocks: Array.isArray(historyMessage.blocks) ? historyMessage.blocks : [],
        } as SerializedMessage)),
      }

      let iteration = 0
      let providerState: ChatProviderState | undefined
      let pendingToolResults: ToolInvocationResult[] | null = null

      while (iteration < MAX_ITERATIONS) {
        if (signal.aborted) {
          finalStatus = 'aborted'
          break
        }

        iteration += 1

        const generator = runAnthropicChat({
          options: chatRequestConfig,
          continuation:
            pendingToolResults && providerState
              ? {
                  state: providerState,
                  toolResults: pendingToolResults,
                }
              : undefined,
          signal,
        })

        let result: ChatRunResult | undefined

        while (true) {
          const { done, value } = await generator.next()
          if (done) {
            result = value
            break
          }

          await emitEvent(value)

          if (signal.aborted) {
            finalStatus = 'aborted'
            break
          }
        }

        if (signal.aborted || result?.aborted) {
          finalStatus = 'aborted'
          break
        }

        if (!result) {
          break
        }

        providerState = result.state ?? providerState

        if (!result.shouldContinue) {
          break
        }

        if (!providerState) {
          await emitEvent(
            toEventError(
              `错误：缺少继续对话所需的状态 (model=${chatRequestConfig.model})`,
            ),
          )
          finalStatus = 'error'
          break
        }

        const toolGen = executeToolsGen(result.pendingToolCalls, signal)
        let toolResults: ToolInvocationResult[] | null = null

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

        pendingToolResults = toolResults
      }

      if (iteration >= MAX_ITERATIONS && finalStatus === 'completed') {
        await emitEvent(
          toEventError(
            `[已达到最大工具调用次数限制] iteration=${iteration} maxIterations=${MAX_ITERATIONS} model=${chatRequestConfig.model}`,
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
        await this.persistConversationSnapshot(message.conversationId, workingTree)
      } catch (error) {
        finalStatus = 'error'
        getLogger().log('AGENT', 'Persist conversation failed', {
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

      this.setState({
        ...this.state,
        status: finalStatus,
        updatedAt: Date.now(),
      })

      this.clearEventCache()
    }
  }

  private listEvents(lastEventId: number): PersistedChatEvent[] {
    const rows = this.sql<PersistedEventRow>`
      SELECT id, request_id, event_json, created_at
      FROM events
      WHERE id > ${lastEventId}
      ORDER BY id ASC
    `

    return rows
      .map((row) => {
        try {
          return {
            eventId: Number(row.id),
            requestId: row.request_id,
            event: JSON.parse(row.event_json) as ChatServerToClientEvent,
            createdAt: Number(row.created_at),
          } satisfies PersistedChatEvent
        } catch {
          return null
        }
      })
      .filter((item): item is PersistedChatEvent => !!item)
  }

  private persistAndBroadcastEvent(requestId: string, event: ChatServerToClientEvent) {
    const createdAt = Date.now()

    void this.sql`
      INSERT INTO events (request_id, event_json, created_at)
      VALUES (${requestId}, ${JSON.stringify(event)}, ${createdAt})
    `

    const inserted = this.sql<{ id: number }>`SELECT last_insert_rowid() AS id`
    const eventId = Number(inserted[0]?.id ?? 0)

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
    void this.sql`DELETE FROM events`
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
  }
}
