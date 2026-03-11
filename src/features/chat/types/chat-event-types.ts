export type ChatErrorCode =
  | 'invalid_request'
  | 'authentication_failed'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'model_unavailable'
  | 'service_unavailable'
  | 'timeout'
  | 'network_error'
  | 'server_error'
  | 'provider_error'
  | 'unknown'

export type ChatErrorProvider =
  | 'anthropic'
  | 'openai'
  | 'openai-responses'
  | 'gemini'
  | 'system'

export type ChatErrorInfo = {
  code: ChatErrorCode
  provider?: ChatErrorProvider
  model?: string
  backend?: string
  status?: number
  retryable?: boolean
  details?: string
}

export type ChatServerToClientEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; content: string }
  | {
      type: 'tool_call'
      tool: string
      args: Record<string, object | string | number | boolean>
      callId?: string
    }
  | { type: 'tool_result'; tool: string; result: string; callId?: string }
  | { type: 'error'; message: string; error?: ChatErrorInfo }
  | {
      type: 'conversation_created'
      conversationId: string
      title: string
      user_id: string
      created_at: string
      updated_at: string
    }
  | {
      type: 'conversation_updated'
      conversationId: string
      title?: string
      updated_at: string
    }
