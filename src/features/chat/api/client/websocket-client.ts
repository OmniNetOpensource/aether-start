import { AgentClient } from 'agents/client'
import type { ChatServerToClientEvent } from '@/features/chat/api/shared/event-types'
import type {
  ChatAgentClientMessage,
  ChatAgentServerMessage,
  ChatAgentStatus,
  MessageTreeSnapshot,
} from '@/features/chat/api/shared/types'
import type { SerializedMessage } from '@/features/chat/types/chat'

const AGENT_NAME = 'chat-agent'

export type AgentStatusResponse = {
  status: ChatAgentStatus
  requestId?: string
}

export const checkAgentStatus = async (
  conversationId: string,
): Promise<AgentStatusResponse> => {
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http'
  const host = resolveAgentHost()
  const url = `${protocol}://${host}/agents/${AGENT_NAME}/${conversationId}`

  const res = await fetch(url, { method: 'GET', credentials: 'include' })
  if (res.status === 404) {
    return { status: 'idle' }
  }
  if (!res.ok) {
    throw new Error(`Agent status probe failed: ${res.status}`)
  }

  const data = await res.json() as Record<string, unknown>
  const status = isChatAgentStatus(data.status) ? data.status : 'idle'
  const requestId = typeof data.requestId === 'string' ? data.requestId : undefined

  return { status, requestId }
}

const resolveAgentHost = () => {
  if (typeof window === 'undefined') {
    return 'localhost:3000'
  }

  return window.location.host
}

const resolveAgentSecure = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.protocol === 'https:'
}

const resolveAgentProtocol = () => (resolveAgentSecure() ? 'wss' : 'ws')

const eventCursorByConversation = new Map<string, number>()

const getLastEventId = (conversationId: string) =>
  eventCursorByConversation.get(conversationId) ?? 0

const markEventId = (conversationId: string, eventId: number) => {
  const current = getLastEventId(conversationId)
  if (eventId > current) {
    eventCursorByConversation.set(conversationId, eventId)
  }
}

const shouldConsumeEvent = (conversationId: string, eventId: number) =>
  eventId > getLastEventId(conversationId)

export const resetConversationEventCursor = (conversationId: string) => {
  if (!conversationId) {
    return
  }

  eventCursorByConversation.delete(conversationId)
}

export const clearConversationEventCursors = () => {
  eventCursorByConversation.clear()
}

const isChatAgentStatus = (value: unknown): value is ChatAgentStatus =>
  value === 'idle' ||
  value === 'running' ||
  value === 'completed' ||
  value === 'aborted' ||
  value === 'error'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export type ChatStatusEvent =
  | {
      type: 'sync'
      status: ChatAgentStatus
      requestId?: string
    }
  | {
      type: 'started'
      requestId: string
    }
  | {
      type: 'finished'
      requestId: string
      status: 'completed' | 'aborted' | 'error'
    }
  | {
      type: 'busy'
      currentRequestId: string
    }

export type ChatEventMeta = {
  requestId: string
  eventId: number
  source: 'sync' | 'live'
}

export type ChatClientOptions = {
  onEvent: (event: ChatServerToClientEvent, meta: ChatEventMeta) => void
  onError: (error: Error) => void
  onStatus?: (event: ChatStatusEvent) => void
}

export class ChatClient {
  private client: AgentClient | null = null
  private conversationId: string | null = null
  private suppressCloseError = false

  constructor(private options: ChatClientOptions) {}

  public async connect(conversationId: string) {
    if (this.client && this.conversationId === conversationId) {
      return
    }

    this.disconnect()

    this.suppressCloseError = false
    this.conversationId = conversationId

    const client = new AgentClient({
      agent: AGENT_NAME,
      name: conversationId,
      host: resolveAgentHost(),
      protocol: resolveAgentProtocol(),
    })

    client.addEventListener('message', this.handleMessage)
    client.addEventListener('error', this.handleSocketError)
    client.addEventListener('close', this.handleSocketClose)

    this.client = client

    await client.ready
  }

  public async sync(conversationId: string) {
    await this.connect(conversationId)

    this.send({
      type: 'sync',
      conversationId,
      lastEventId: getLastEventId(conversationId),
    })
  }

  public async sendMessage(params: {
    requestId: string
    role: string
    conversationId: string
    conversationHistory: SerializedMessage[]
    treeSnapshot: MessageTreeSnapshot
  }) {
    await this.sync(params.conversationId)

    this.send({
      type: 'chat_request',
      requestId: params.requestId,
      conversationId: params.conversationId,
      role: params.role,
      conversationHistory: params.conversationHistory,
      treeSnapshot: params.treeSnapshot,
    })
  }

  public abort(requestId?: string) {
    if (!this.client) {
      return
    }

    this.send({
      type: 'abort',
      requestId,
    })
  }

  public disconnect() {
    if (!this.client) {
      return
    }

    this.suppressCloseError = true

    this.client.removeEventListener('message', this.handleMessage)
    this.client.removeEventListener('error', this.handleSocketError)
    this.client.removeEventListener('close', this.handleSocketClose)

    this.client.close()
    this.client = null
    this.conversationId = null
  }

  private send(message: ChatAgentClientMessage) {
    if (!this.client) {
      throw new Error('WebSocket 尚未连接')
    }

    this.client.send(JSON.stringify(message))
  }

  private handleSocketError = () => {
    this.options.onError(new Error('连接到聊天服务失败'))
  }

  private handleSocketClose = () => {
    if (this.suppressCloseError) {
      return
    }

    this.options.onError(new Error('聊天连接已断开'))
  }

  private handleMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') {
      return
    }

    const parsed = safeJsonParse(event.data)
    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return
    }

    const payload = parsed as ChatAgentServerMessage & Record<string, unknown>

    if (payload.type === 'sync_response') {
      const status = isChatAgentStatus(payload.status) ? payload.status : 'idle'
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined
      const events = Array.isArray(payload.events) ? payload.events : []

      this.options.onStatus?.({
        type: 'sync',
        status,
        requestId,
      })

      for (const item of events) {
        if (!isRecord(item)) {
          continue
        }

        const eventId = typeof item.eventId === 'number' ? item.eventId : null
        const eventRequestId = typeof item.requestId === 'string' ? item.requestId : null
        const serverEvent = isRecord(item.event)
          ? (item.event as ChatServerToClientEvent)
          : null

        if (!this.conversationId || !eventId || !eventRequestId || !serverEvent) {
          continue
        }

        if (!shouldConsumeEvent(this.conversationId, eventId)) {
          continue
        }

        markEventId(this.conversationId, eventId)

        this.options.onEvent(serverEvent, {
          requestId: eventRequestId,
          eventId,
          source: 'sync',
        })
      }
      return
    }

    if (payload.type === 'chat_event') {
      const eventId = typeof payload.eventId === 'number' ? payload.eventId : null
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : null
      const serverEvent = isRecord(payload.event)
        ? (payload.event as ChatServerToClientEvent)
        : null

      if (!this.conversationId || !eventId || !requestId || !serverEvent) {
        return
      }

      if (!shouldConsumeEvent(this.conversationId, eventId)) {
        return
      }

      markEventId(this.conversationId, eventId)

      this.options.onEvent(serverEvent, {
        requestId,
        eventId,
        source: 'live',
      })
      return
    }

    if (payload.type === 'chat_started') {
      if (typeof payload.requestId !== 'string') {
        return
      }

      this.options.onStatus?.({
        type: 'started',
        requestId: payload.requestId,
      })
      return
    }

    if (payload.type === 'chat_finished') {
      if (typeof payload.requestId !== 'string') {
        return
      }

      const status =
        payload.status === 'completed' ||
        payload.status === 'aborted' ||
        payload.status === 'error'
          ? payload.status
          : 'error'

      this.options.onStatus?.({
        type: 'finished',
        requestId: payload.requestId,
        status,
      })
      return
    }

    if (payload.type === 'busy') {
      if (typeof payload.currentRequestId !== 'string') {
        return
      }

      this.options.onStatus?.({
        type: 'busy',
        currentRequestId: payload.currentRequestId,
      })
      return
    }

    if (payload.type === 'conversation_update') {
      const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null
      const title = typeof payload.title === 'string' ? payload.title : null
      const updated_at = typeof payload.updated_at === 'string' ? payload.updated_at : null

      if (!conversationId || !title || !updated_at) {
        return
      }

      this.options.onEvent(
        {
          type: 'conversation_updated',
          conversationId,
          title,
          updated_at,
        },
        {
          requestId: '',
          eventId: 0,
          source: 'live',
        },
      )
    }
  }
}
