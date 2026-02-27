import type { SerializedMessage } from '@/types/message'
import type { Message } from '@/types/message'
import type { ChatServerToClientEvent } from './chat-event-types'

export type { ChatServerToClientEvent } from './chat-event-types'

// Tool call pending execution
export type PendingToolInvocation = {
  id: string
  name: string
  args: Record<string, unknown>
}

// Result from tool execution
export type ToolInvocationResult = {
  id: string
  name: string
  result: string
}

export type MessageTreeSnapshot = {
  messages: Message[]
  currentPath: number[]
  latestRootId: number | null
  nextId: number
}

export type PersistedChatEvent = {
  eventId: number
  requestId: string
  event: ChatServerToClientEvent
  createdAt: number
}

export type ChatAgentClientMessage =
  | {
      type: 'sync'
      conversationId: string
      lastEventId?: number
    }
  | {
      type: 'chat_request'
      requestId: string
      conversationId: string
      role: string
      conversationHistory: SerializedMessage[]
      treeSnapshot: MessageTreeSnapshot
    }
  | {
      type: 'abort'
      requestId?: string
    }

export type ChatAgentStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error'

export type ChatAgentServerMessage =
  | {
      type: 'sync_response'
      status: ChatAgentStatus
      requestId?: string
      events: PersistedChatEvent[]
    }
  | {
      type: 'chat_event'
      eventId: number
      requestId: string
      event: ChatServerToClientEvent
    }
  | {
      type: 'chat_started'
      requestId: string
    }
  | {
      type: 'chat_finished'
      requestId: string
      status: Exclude<ChatAgentStatus, 'idle' | 'running'>
    }
  | {
      type: 'busy'
      currentRequestId: string
    }
  | {
      type: 'conversation_update'
      conversationId: string
      title: string
      updated_at: string
    }
