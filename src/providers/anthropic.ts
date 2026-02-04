import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/src/server/chat/utils";
import { getAnthropicConfig } from "./config";
import type {
  ChatOptions,
  ChatResult,
  ChatState,
  PendingToolCall,
  StreamEvent,
  ToolCallResult,
} from "./types";
import type { ChatTool } from "@/src/providers/tools/types";
import type { SerializedMessage } from "@/src/features/chat/types/chat";

type AnthropicImageSource = {
  type: "base64";
  media_type: string;
  data: string;
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicStreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_delta"; partial_json: string }
  | { type: "stop"; stop_reason: string };

type AnthropicState = {
  messages: AnthropicMessage[];
  lastAssistantText: string;
  lastPendingToolCalls: PendingToolCall[];
};

const getClient = () => {
  const config = getAnthropicConfig();
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders,
  });
};

function convertToAnthropicMessages(history: SerializedMessage[]): AnthropicMessage[] {
  return history.map((msg) => {
    const contentBlocks: AnthropicContentBlock[] = [];

    for (const block of msg.blocks) {
      if (block.type === "content" && block.content) {
        contentBlocks.push({ type: "text", text: block.content });
      } else if (block.type === "attachments") {
        for (const att of block.attachments) {
          if (att.kind === "image" && att.url) {
            const base64Match = att.url.match(/^data:([^;]+);base64,(.+)$/);
            if (base64Match) {
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: base64Match[1],
                  data: base64Match[2],
                },
              });
            }
          }
        }
      }
    }

    return {
      role: msg.role,
      content: contentBlocks.length > 0 ? contentBlocks : "",
    };
  });
}

function convertToolsToAnthropic(tools: ChatTool[]): AnthropicTool[] {
  return tools
    .filter((t) => t.type === "function")
    .map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Record<string, unknown>,
    }));
}

async function* streamAnthropicCompletion(params: {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
}): AsyncGenerator<AnthropicStreamChunk> {
  const client = getClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamParams: any = {
    model: params.model,
    messages: params.messages as Anthropic.MessageParam[],
    system: params.system,
    tools: params.tools as Anthropic.Tool[],
    max_tokens: 64000,
    thinking: {
      type: "enabled",
      budget_tokens: 51404,
    },
  };

  const stream = client.messages.stream(streamParams);

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "tool_use") {
        yield {
          type: "tool_use_start",
          id: event.content_block.id,
          name: event.content_block.name,
        };
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      } else if (event.delta.type === "input_json_delta") {
        yield { type: "tool_use_delta", partial_json: event.delta.partial_json };
      } else if (event.delta.type === "thinking_delta") {
        yield { type: "thinking", thinking: (event.delta as { type: "thinking_delta"; thinking: string }).thinking };
      }
    } else if (event.type === "message_delta") {
      if (event.delta.stop_reason) {
        yield { type: "stop", stop_reason: event.delta.stop_reason };
      }
    }
  }
}

const createInitialState = (options: ChatOptions): AnthropicState => {
  const systemPrompt = buildSystemPrompt();
  const rolePrompt = options.systemPrompt?.trim();
  const rolePromptMessages: AnthropicMessage[] = rolePrompt
    ? [{ role: "user", content: rolePrompt }]
    : [];

  return {
    messages: [
      { role: "user", content: systemPrompt },
      ...rolePromptMessages,
      ...convertToAnthropicMessages(options.messages),
    ],
    lastAssistantText: "",
    lastPendingToolCalls: [],
  };
};

const toChatState = (state: AnthropicState): ChatState => ({
  backend: "anthropic",
  data: state,
});

const appendToolResults = (state: AnthropicState, results: ToolCallResult[]): AnthropicState => {
  const assistantContent: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  > = [];

  if (state.lastAssistantText) {
    assistantContent.push({ type: "text", text: state.lastAssistantText });
  }

  for (const tc of state.lastPendingToolCalls) {
    assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
  }

  const toolResultContent: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = results.map(
    (tr) => ({
      type: "tool_result",
      tool_use_id: tr.id,
      content: tr.result,
    })
  );

  return {
    messages: [
      ...state.messages,
      { role: "assistant", content: assistantContent },
      { role: "user", content: toolResultContent as AnthropicMessage["content"] },
    ],
    lastAssistantText: "",
    lastPendingToolCalls: [],
  };
};

export async function* runAnthropicChat(
  options: ChatOptions,
  state?: ChatState
): AsyncGenerator<StreamEvent, ChatResult> {
  const workingState = state && state.backend === "anthropic"
    ? (state.data as AnthropicState)
    : createInitialState(options);

  const anthropicTools = options.tools.length > 0 ? convertToolsToAnthropic(options.tools) : undefined;

  let assistantText = "";
  const pendingToolCalls: PendingToolCall[] = [];
  let currentToolId = "";
  let currentToolName = "";
  let currentToolJson = "";
  let stopReason = "";

  try {
    for await (const chunk of streamAnthropicCompletion({
      model: options.model,
      messages: workingState.messages,
      tools: anthropicTools,
    })) {
      if (chunk.type === "text") {
        assistantText += chunk.text;
        yield { type: "content", content: chunk.text };
      } else if (chunk.type === "thinking") {
        yield { type: "thinking", content: chunk.thinking };
      } else if (chunk.type === "tool_use_start") {
        currentToolId = chunk.id;
        currentToolName = chunk.name;
        currentToolJson = "";
      } else if (chunk.type === "tool_use_delta") {
        currentToolJson += chunk.partial_json;
      } else if (chunk.type === "stop") {
        stopReason = chunk.stop_reason;
        if (currentToolId && currentToolName) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(currentToolJson || "{}");
          } catch {
          }
          pendingToolCalls.push({ id: currentToolId, name: currentToolName, args });
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Anthropic completion";
    const model = options?.model ?? "unknown";
    yield {
      type: "error",
      message: `错误：Anthropic 请求失败 (model=${model}): ${message}`,
    };
    return {
      shouldContinue: false,
      pendingToolCalls: [],
      assistantText: "",
      state: toChatState(workingState),
    };
  }

  if (stopReason === "end_turn" || pendingToolCalls.length === 0) {
    return {
      shouldContinue: false,
      pendingToolCalls: [],
      assistantText,
      state: toChatState({
        ...workingState,
        lastAssistantText: "",
        lastPendingToolCalls: [],
      }),
    };
  }

  const nextState: AnthropicState = {
    ...workingState,
    lastAssistantText: assistantText,
    lastPendingToolCalls: pendingToolCalls,
  };

  return {
    shouldContinue: true,
    pendingToolCalls,
    assistantText,
    state: toChatState(nextState),
  };
}

export async function* continueAnthropicChat(
  options: ChatOptions,
  state: ChatState,
  toolResults: ToolCallResult[]
): AsyncGenerator<StreamEvent, ChatResult> {
  if (state.backend !== "anthropic") {
    throw new Error("Invalid anthropic state");
  }
  const nextState = appendToolResults(state.data as AnthropicState, toolResults);
  return yield* runAnthropicChat(options, { backend: "anthropic", data: nextState });
}
