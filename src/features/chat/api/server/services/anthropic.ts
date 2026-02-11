import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/features/chat/api/server/services/utils";
import { getAnthropicConfig } from "@/features/chat/api/server/services/chat-config";
import { getLogger } from "./logger";
import { arrayBufferToBase64, parseDataUrl } from '@/server/base64'
import { getServerBindings } from '@/server/env'
import type {
  ChatRequestConfig,
  ChatRunResult,
  ChatProviderState,
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from "../../types/schemas/types";
import type { ChatTool } from "@/features/chat/api/server/tools/types";
import type { SerializedMessage } from "@/features/chat/types/chat";

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

const ANTHROPIC_MAX_TOKENS = 64000;
const THINKING_BUDGET_RATIO = 0.8;
const THINKING_MIN_BUDGET_TOKENS = 1024;
const ADAPTIVE_THINKING_MODEL = "claude-opus-4-6";

type AnthropicThinkingParams =
  | {
      thinking: {
        type: "adaptive";
      };
      output_config: {
        effort: "medium";
      };
    }
  | {
      thinking: {
        type: "enabled";
        budget_tokens: number;
      };
    };

const getThinkingBudgetTokens = (maxTokens: number): number => {
  const proposedBudgetTokens = Math.floor(maxTokens * THINKING_BUDGET_RATIO);
  const maxAllowedBudgetTokens = maxTokens - 1;

  if (maxAllowedBudgetTokens < THINKING_MIN_BUDGET_TOKENS) {
    return Math.max(1, maxAllowedBudgetTokens);
  }

  return Math.min(
    maxAllowedBudgetTokens,
    Math.max(THINKING_MIN_BUDGET_TOKENS, proposedBudgetTokens),
  );
};

const buildThinkingParams = (model: string, maxTokens: number): AnthropicThinkingParams => {
  if (model === ADAPTIVE_THINKING_MODEL) {
    return {
      thinking: {
        type: "adaptive",
      },
      output_config: {
        effort: "medium",
      },
    };
  }

  return {
    thinking: {
      type: "enabled",
      budget_tokens: getThinkingBudgetTokens(maxTokens),
    },
  };
};

const getClient = (backend: ChatRequestConfig["backend"]) => {
  const anthropicConfig = getAnthropicConfig(backend);
  return new Anthropic({
    apiKey: anthropicConfig.apiKey,
    baseURL: anthropicConfig.baseURL,
    defaultHeaders: anthropicConfig.defaultHeaders,
  });
};

const resolveAttachmentToBase64 = async (attachment: {
  name: string
  mimeType: string
  url?: string
  storageKey?: string
}): Promise<{ media_type: string; data: string } | null> => {
  if (attachment.url) {
    const parsed = parseDataUrl(attachment.url)
    if (parsed) {
      return {
        media_type: parsed.mimeType,
        data: parsed.base64,
      }
    }
  }

  if (attachment.storageKey) {
    try {
      const { CHAT_ASSETS } = getServerBindings()
      const object = await CHAT_ASSETS.get(attachment.storageKey)
      if (!object) {
        getLogger().log('ANTHROPIC', `R2 object not found for ${attachment.storageKey}`)
      } else {
        const buffer = await object.arrayBuffer()
        return {
          media_type: object.httpMetadata?.contentType || attachment.mimeType,
          data: arrayBufferToBase64(buffer),
        }
      }
    } catch (error) {
      getLogger().log('ANTHROPIC', `Failed to read storageKey ${attachment.storageKey}`, error)
    }
  }

  if (attachment.url && /^https?:\/\//.test(attachment.url)) {
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) {
        getLogger().log('ANTHROPIC', `Failed to fetch attachment url`, {
          url: attachment.url,
          status: response.status,
        })
        return null
      }

      const arrayBuffer = await response.arrayBuffer()
      return {
        media_type: response.headers.get('content-type') || attachment.mimeType,
        data: arrayBufferToBase64(arrayBuffer),
      }
    } catch (error) {
      getLogger().log('ANTHROPIC', `Failed to fetch http attachment`, error)
    }
  }

  return null
}

async function convertToAnthropicMessages(history: SerializedMessage[]): Promise<AnthropicMessage[]> {
  getLogger().log('ANTHROPIC', '转换为 Anthropic 格式', { messageCount: history.length });

  return Promise.all(history.map(async (message, msgIdx) => {
    const contentBlocks: AnthropicContentBlock[] = [];

    for (const block of message.blocks) {
      if (block.type === "content" && block.content) {
        contentBlocks.push({ type: "text", text: block.content });
      } else if (block.type === "attachments") {
        for (const attachment of block.attachments) {
          if (attachment.kind === "image") {
            const resolved = await resolveAttachmentToBase64({
              name: attachment.name,
              mimeType: attachment.mimeType,
              url: attachment.url,
              storageKey: attachment.storageKey,
            })

            if (resolved) {
              getLogger().log('ANTHROPIC', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 转换成功`, {
                media_type: resolved.media_type,
                dataLength: resolved.data.length,
              });
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: resolved.media_type,
                  data: resolved.data,
                },
              });
            } else {
              getLogger().log('ANTHROPIC', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`)
            }
          }
        }
      }
    }

    return {
      role: message.role,
      content: contentBlocks.length > 0 ? contentBlocks : "",
    };
  }))
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
  backend: ChatRequestConfig["backend"];
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
  signal?: AbortSignal;
}): AsyncGenerator<AnthropicStreamChunk> {
  const client = getClient(requestParams.backend);
  const anthropicConfig = getAnthropicConfig(requestParams.backend);
  const thinkingParams = buildThinkingParams(requestParams.model, ANTHROPIC_MAX_TOKENS);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamParams: any = {
    model: requestParams.model,
    messages: requestParams.messages as Anthropic.MessageParam[],
    system: requestParams.system,
    tools: requestParams.tools as Anthropic.Tool[],
    max_tokens: ANTHROPIC_MAX_TOKENS,
    ...thinkingParams,
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

  const stream = client.messages.stream(streamParams, {
    signal: requestParams.signal,
  });

  for await (const event of stream) {
    if (requestParams.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

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

const createInitialState = async (options: ChatRequestConfig): Promise<AnthropicState> => {
  const systemPrompt = buildSystemPrompt();
  const rolePrompt = options.systemPrompt?.trim();
  const rolePromptMessages: AnthropicMessage[] = rolePrompt
    ? [{ role: "user", content: rolePrompt }]
    : [];

  return {
    messages: [
      { role: "user", content: systemPrompt },
      ...rolePromptMessages,
      ...(await convertToAnthropicMessages(options.messages)),
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

type RunAnthropicChatParams = {
  options: ChatRequestConfig;
  continuation?: {
    state: ChatProviderState;
    toolResults: ToolInvocationResult[];
  };
  signal?: AbortSignal;
};

export async function* runAnthropicChat(
  params: RunAnthropicChatParams
): AsyncGenerator<ChatServerToClientEvent, ChatRunResult> {
  const continuationState = params.continuation
    ? appendToolResults(
      params.continuation.state.data as AnthropicState,
      params.continuation.toolResults
    )
    : undefined;

  const options = params.options;
  const workingState = continuationState ?? (await createInitialState(options));

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
      backend: options.backend,
      messages: workingState.messages,
      tools: anthropicTools,
      signal: params.signal,
    })) {
      if (params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

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
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError') ||
      params.signal?.aborted
    ) {
      return {
        shouldContinue: false,
        pendingToolCalls: [],
        assistantText,
        state: toChatState(workingState),
        aborted: true,
      }
    }

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
