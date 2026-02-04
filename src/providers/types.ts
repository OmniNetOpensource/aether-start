import type { SerializedMessage } from "@/src/features/chat/types/chat";
import type { ChatTool } from "@/src/providers/tools/types";

export type Backend = "openrouter" | "anthropic" | "openai" | "gemini";

export type ProviderPreferences = {
  order: string[];
};

// Stream events sent to the client
export type StreamEvent =
  | { type: "content"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; callId?: string }
  | {
      type: "tool_progress";
      tool: string;
      stage: string;
      message: string;
      receivedBytes?: number;
      totalBytes?: number;
      callId?: string;
    }
  | { type: "tool_result"; tool: string; result: unknown; callId?: string }
  | { type: "error"; message: string }
  | { type: "conversation_created"; conversationId: string; title: string; user_id: string; created_at: string; updated_at: string }
  | { type: "conversation_updated"; conversationId: string; updated_at: string };

// Tool call pending execution
export type PendingToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

// Result from tool execution
export type ToolCallResult = {
  id: string;
  name: string;
  result: string;
};

export type ChatOptions = {
  backend: Backend;
  model: string;
  messages: SerializedMessage[];
  tools: ChatTool[];
  systemPrompt?: string;
  provider?: ProviderPreferences;
};

export type ChatState = {
  backend: Backend;
  data: unknown;
};

export type ChatResult = {
  shouldContinue: boolean;
  pendingToolCalls: PendingToolCall[];
  assistantText: string;
  state?: ChatState;
};
