import type { SerializedMessage } from "@/src/features/chat/types/chat";
import type { ChatTool } from "@/src/providers/tools/types";

export type ChatProviderId = "anthropic";

// Stream events sent to the client
export type ChatStreamEvent =
  | { type: "content"; content: string }
  | { type: "thinking"; content: string }
  | {
      type: "tool_call";
      tool: string;
      args: Record<string, unknown>;
      callId?: string;
    }
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
  | {
      type: "conversation_created";
      conversationId: string;
      title: string;
      user_id: string;
      created_at: string;
      updated_at: string;
    }
  | {
      type: "conversation_updated";
      conversationId: string;
      updated_at: string;
    };

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

export type ChatRunOptions = {
  backend: ChatProviderId;
  model: string;
  messages: SerializedMessage[];
  tools: ChatTool[];
  systemPrompt?: string;
};

export type ChatProviderState = {
  backend: ChatProviderId;
  data: unknown;
};

export type ChatRunResult = {
  shouldContinue: boolean;
  pendingToolCalls: PendingToolInvocation[];
  assistantText: string;
  state?: ChatProviderState;
};
