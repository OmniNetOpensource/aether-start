import type {
  ChatServerToClientEvent,
  PendingToolInvocation,
  ToolInvocationResult,
} from '@/shared/chat/chat-api';
import type { ChatTool } from '@/shared/chat/tool-types';
import type { BackendConfig } from './backend-config';
import type { SerializedMessage } from '@/shared/chat/message';

export type ProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[];
  thinkingBlocks: unknown[];
  assistantText: string;
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

  formatToolContinuation(runResult: ProviderRunResult, toolResults: ToolInvocationResult[]): M[];
};
