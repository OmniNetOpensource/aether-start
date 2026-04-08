import type {
  ChatServerToClientEvent,
  PendingToolInvocation,
  ToolInvocationResult,
} from '@/features/chat/chat-api';
import type { ChatTool } from '../tool-types';
import type { BackendConfig } from './backend-config';
import type { SerializedMessage } from '@/features/chat/message-thread';

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
