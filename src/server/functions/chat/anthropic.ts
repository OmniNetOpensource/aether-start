import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/src/server/chat/utils";
import { getAnthropicConfig } from "@/src/server/functions/chat-config";
import { getLogger } from "./logger";
import type {
  ChatRequestConfig,
  ChatRunResult,
  ChatProviderState,
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from "./types";
import type { ChatTool } from "@/src/server/functions/chat/tools/types";
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
  lastPendingToolCalls: PendingToolInvocation[];
};

const getClient = () => {
  const anthropicConfig = getAnthropicConfig();
  return new Anthropic({
    apiKey: anthropicConfig.apiKey,
    baseURL: anthropicConfig.baseURL,
    defaultHeaders: anthropicConfig.defaultHeaders,
  });
};

function convertToAnthropicMessages(history: SerializedMessage[]): AnthropicMessage[] {
  getLogger().log('ANTHROPIC', '转换为 Anthropic 格式', { messageCount: history.length });

  return history.map((message, msgIdx) => {
    const contentBlocks: AnthropicContentBlock[] = [];

    for (const block of message.blocks) {
      if (block.type === "content" && block.content) {
        contentBlocks.push({ type: "text", text: block.content });
      } else if (block.type === "attachments") {
        for (const attachment of block.attachments) {
          if (attachment.kind === "image" && attachment.url) {
            const base64Match = attachment.url.match(/^data:([^;]+);base64,(.+)$/);
            if (base64Match) {
              getLogger().log('ANTHROPIC', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 匹配 base64`, {
                media_type: base64Match[1],
                dataLength: base64Match[2].length,
              });
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: base64Match[1],
                  data: base64Match[2],
                },
              });
            } else {
              getLogger().log('ANTHROPIC', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 未能匹配 base64`);
            }
          }
        }
      }
    }

    return {
      role: message.role,
      content: contentBlocks.length > 0 ? contentBlocks : "",
    };
  });
}

function convertToolsToAnthropic(tools: ChatTool[]): AnthropicTool[] {
  return tools
    .filter((tool) => tool.type === "function")
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters as Record<string, unknown>,
    }));
}

function logHttpRequest(params: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}) {
  const maskedHeaders: Record<string, string> = {};
  Object.entries(params.headers).forEach(([key, value]) => {
    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('authorization')) {
      maskedHeaders[key] = value.length > 8
        ? `${value.slice(0, 4)}...${value.slice(-4)}`
        : '***';
    } else {
      maskedHeaders[key] = value;
    }
  });

  getLogger().log('HTTP', 'Anthropic API request', {
    url: params.url,
    headers: maskedHeaders,
    body: params.body,
  });
}

async function* streamAnthropicCompletion(requestParams: {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
}): AsyncGenerator<AnthropicStreamChunk> {
  const client = getClient();
  const anthropicConfig = getAnthropicConfig();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamParams: any = {
    model: requestParams.model,
    messages: requestParams.messages as Anthropic.MessageParam[],
    system: requestParams.system,
    tools: requestParams.tools as Anthropic.Tool[],
    max_tokens: 64000,
    thinking: {
      type: "enabled",
      budget_tokens: 51404,
    },
  };

  // 打印完整的 HTTP 请求信息
  logHttpRequest({
    url: `${anthropicConfig.baseURL || 'https://api.anthropic.com'}/v1/messages`,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicConfig.apiKey,
      ...anthropicConfig.defaultHeaders,
    },
    body: {
      ...streamParams,
      stream: true,
    },
  });

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

const createInitialState = (options: ChatRequestConfig): AnthropicState => {
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

const toChatState = (state: AnthropicState): ChatProviderState => ({
  data: state,
});

const appendToolResults = (state: AnthropicState, results: ToolInvocationResult[]): AnthropicState => {
  const assistantContent: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  > = [];

  if (state.lastAssistantText) {
    assistantContent.push({ type: "text", text: state.lastAssistantText });
  }

  for (const toolCall of state.lastPendingToolCalls) {
    assistantContent.push({ type: "tool_use", id: toolCall.id, name: toolCall.name, input: toolCall.args });
  }

  type ToolResultContentItem =
    | { type: "text"; text: string }
    | { type: "image"; source: AnthropicImageSource };

  const toolResultContent: Array<{
    type: "tool_result";
    tool_use_id: string;
    content: string | ToolResultContentItem[];
  }> = results.map((toolResult) => {
    // Check if result is a JSON image result
    try {
      const parsed = JSON.parse(toolResult.result);
      if (parsed.type === "image" && parsed.data_url) {
        const base64Match = parsed.data_url.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
          return {
            type: "tool_result" as const,
            tool_use_id: toolResult.id,
            content: [
              {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: base64Match[1],
                  data: base64Match[2],
                },
              },
            ],
          };
        }
      }
    } catch {
      // Not JSON, use as plain text
    }

    return {
      type: "tool_result" as const,
      tool_use_id: toolResult.id,
      content: toolResult.result,
    };
  });

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

async function* runAnthropicChat(
  options: ChatRequestConfig,
  state?: ChatProviderState
): AsyncGenerator<ChatServerToClientEvent, ChatRunResult> {
  const workingState = state
    ? (state.data as AnthropicState)
    : createInitialState(options);

  const anthropicTools = options.tools.length > 0 ? convertToolsToAnthropic(options.tools) : undefined;

  let assistantText = "";
  const pendingToolCalls: PendingToolInvocation[] = [];
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
          let toolArguments: Record<string, unknown> = {};
          try {
            toolArguments = JSON.parse(currentToolJson || "{}");
          } catch {
          }
          pendingToolCalls.push({ id: currentToolId, name: currentToolName, args: toolArguments });
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

type RunChatParams = {
  options: ChatRequestConfig;
  continuation?: {
    state: ChatProviderState;
    toolResults: ToolInvocationResult[];
  };
};

export async function* runChat(
  params: RunChatParams
): AsyncGenerator<ChatServerToClientEvent, ChatRunResult> {
  const continuationState = params.continuation
    ? appendToolResults(
      params.continuation.state.data as AnthropicState,
      params.continuation.toolResults
    )
    : undefined;

  return yield* runAnthropicChat(params.options, continuationState ? { data: continuationState } : undefined);
}
