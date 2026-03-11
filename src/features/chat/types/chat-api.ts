import type { Message } from '@/types/message'
import type { ChatServerToClientEvent } from './chat-event-types'

export type {
  ChatErrorCode,
  ChatErrorInfo,
  ChatErrorProvider,
  ChatServerToClientEvent,
} from './chat-event-types'

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

export type ChatAgentStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error'
