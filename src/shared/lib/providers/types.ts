import type { SerializedMessage, ProviderPreferences, Backend } from "@/src/features/chat/types/chat";
import type { ChatTool, ToolProgressCallback } from "@/src/shared/lib/tools/types";
import type { ConversationLogger } from "@/src/shared/lib/conversation-logger";

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

// Result from a single iteration
export type IterationResult = {
  shouldContinue: boolean;
  pendingToolCalls: PendingToolCall[];
  assistantText: string;
};

// Configuration passed to provider
export type ProviderConfig = {
  model: string;
  tools: ChatTool[];
  systemInstruction?: string;
  provider?: ProviderPreferences;
  searchEnabled?: boolean;
};

// Context for provider execution
export type ProviderContext = {
  conversationHistory: SerializedMessage[];
  conversationId: string | null;
  logger: ConversationLogger | null;
  onProgress: ToolProgressCallback;
};

// Provider interface
export interface IProvider {
  readonly name: Backend;

  // Initialize the provider with config and context
  initialize(config: ProviderConfig, context: ProviderContext): void;

  // Run a single iteration, yielding stream events
  // Returns iteration result when done
  runIteration(): AsyncGenerator<StreamEvent, IterationResult, undefined>;

  // Append tool results for the next iteration
  appendToolResults(results: ToolCallResult[]): void;
}
