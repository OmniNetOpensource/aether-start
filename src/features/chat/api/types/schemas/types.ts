import type { SerializedMessage } from "@/features/chat/types/chat";
import type { ChatTool } from "@/features/chat/server/tools/types";

export type { ChatServerToClientEvent } from "@/features/chat/types/server-events";

// Tool call pending execution
export type PendingToolInvocation = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

// Result from tool execution
export type ToolInvocationResult = {
  id: string;
  name: string;
  result: string;
};

export type ChatRequestConfig = {
  model: string;
  messages: SerializedMessage[];
  tools: ChatTool[];
  systemPrompt?: string;
};

export type ChatProviderState = {
  data: unknown;
};

export type ChatRunResult = {
  shouldContinue: boolean;
  pendingToolCalls: PendingToolInvocation[];
  assistantText: string;
  state?: ChatProviderState;
};
