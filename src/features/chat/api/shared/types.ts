import type { SerializedMessage } from '@/features/chat/types/chat'
import type { ChatTool } from '@/features/chat/api/server/tools/types'
import type { AnthropicBackend } from '@/features/chat/api/server/services/chat-config'
import type { Message } from '@/features/conversation/model/types/message'
import type { ChatServerToClientEvent } from './event-types'

export type { ChatServerToClientEvent } from './event-types'

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

export type ChatRequestConfig = {
  model: string
  backend: AnthropicBackend
  messages: SerializedMessage[]
  tools: ChatTool[]
  systemPrompt?: string
}

export type ChatProviderState = {
  data: unknown
}

export type ChatRunResult = {
  shouldContinue: boolean
  pendingToolCalls: PendingToolInvocation[]
  assistantText: string
  state?: ChatProviderState
  aborted?: boolean
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
