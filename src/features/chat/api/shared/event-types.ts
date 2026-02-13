export type ChatServerToClientEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; content: string }
  | {
      type: 'tool_call'
      tool: string
      args: Record<string, object | string | number | boolean>
      callId?: string
    }
  | {
      type: 'tool_progress'
      tool: string
      stage: string
      message: string
      receivedBytes?: number
      totalBytes?: number
      callId?: string
    }
  | { type: 'tool_result'; tool: string; result: string; callId?: string }
  | { type: 'error'; message: string }
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
      updated_at: string
    }
