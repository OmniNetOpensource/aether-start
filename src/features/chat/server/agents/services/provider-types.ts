import type {
  ChatServerToClientEvent,
  PendingToolInvocation,
  ToolInvocationResult,
} from '@/types/chat-api'
import type { ChatTool } from '@/server/agents/tools/types'
import type { BackendConfig } from '@/server/agents/services/chat-config'
import type { SerializedMessage } from '@/types/message'

export type ProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[]
  thinkingBlocks: unknown[]
}

export type ChatProviderConfig = {
  model: string
  backendConfig: BackendConfig
  tools: ChatTool[]
  systemPrompt: string
}

export type ChatProvider<M = unknown> = {
  convertMessages(history: SerializedMessage[]): Promise<M[]>

  run(
    messages: M[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, ProviderRunResult>

  formatToolContinuation(
    assistantText: string,
    runResult: ProviderRunResult,
    pendingToolCalls: PendingToolInvocation[],
    toolResults: ToolInvocationResult[],
  ): M[]
}
