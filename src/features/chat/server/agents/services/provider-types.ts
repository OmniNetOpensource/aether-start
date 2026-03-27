import type {
  ChatServerToClientEvent,
  PendingToolInvocation,
  ToolInvocationResult,
} from '@/features/chat/types/chat-api';
import type { ChatTool } from '@/features/chat/server/agents/tools/types';
import type { BackendConfig } from '@/features/chat/server/agents/services/model-provider-config';
import type { SerializedMessage } from '@/features/chat/types/message';

export type ProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[];
  thinkingBlocks: unknown[];
};

export type ChatProviderConfig = {
  model: string;
  backendConfig: BackendConfig;
  tools: ChatTool[];
  systemPrompt: string;
};

export type ChatProvider<M = unknown> = {
  convertMessages(history: SerializedMessage[]): Promise<M[]>;

  run(
    messages: M[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, ProviderRunResult>;

  formatToolContinuation(
    assistantText: string,
    runResult: ProviderRunResult,
    pendingToolCalls: PendingToolInvocation[],
    toolResults: ToolInvocationResult[],
  ): M[];
};
