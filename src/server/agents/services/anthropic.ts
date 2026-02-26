import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  getAnthropicConfig,
  type ChatBackend,
} from "@/server/agents/services/chat-config";
import { log } from "./logger";
import { arrayBufferToBase64, parseDataUrl } from '@/server/base64'
import { getServerBindings } from '@/server/env'
import type {
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from "@/types/chat-api";
import type { ChatTool } from "@/server/agents/tools/types";
import type { SerializedMessage } from "@/types/message";

type AnthropicImageSource = {
  type: "base64";
  media_type: string;
  data: string;
};

export type ThinkingBlockData =
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | ThinkingBlockData;

export type AnthropicMessage = {
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
  | { type: "stop"; stop_reason: string }
  | { type: "thinking_blocks"; blocks: ThinkingBlockData[] };

const ANTHROPIC_MAX_TOKENS = 64000;
const THINKING_BUDGET_RATIO = 0.8;
const THINKING_MIN_BUDGET_TOKENS = 1024;
const ADAPTIVE_THINKING_MODEL = "claude-opus-4-6";

type AnthropicBackend = Extract<ChatBackend, 'rightcode'>

type AnthropicThinkingParams =
  | {
      thinking: {
        type: "adaptive";
      };
      output_config: {
        effort: "high";
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
        effort: "high",
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

const getClient = (backend: AnthropicBackend) => {
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
        log('ANTHROPIC', `R2 object not found for ${attachment.storageKey}`)
      } else {
        const buffer = await object.arrayBuffer()
        return {
          media_type: object.httpMetadata?.contentType || attachment.mimeType,
          data: arrayBufferToBase64(buffer),
        }
      }
    } catch (error) {
      log('ANTHROPIC', `Failed to read storageKey ${attachment.storageKey}`, error)
    }
  }

  if (attachment.url && /^https?:\/\//.test(attachment.url)) {
    try {
      const response = await fetch(attachment.url)
      if (!response.ok) {
        log('ANTHROPIC', `Failed to fetch attachment url`, {
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
      log('ANTHROPIC', `Failed to fetch http attachment`, error)
    }
  }

  return null
}

export async function convertToAnthropicMessages(history: SerializedMessage[]): Promise<AnthropicMessage[]> {
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
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: resolved.media_type,
                  data: resolved.data,
                },
              });
            } else {
              log('ANTHROPIC', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`)
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

async function* streamAnthropicCompletion(requestParams: {
  model: string;
  backend: AnthropicBackend;
  messages: AnthropicMessage[];
  system?: Array<{ type: 'text'; text: string }>;
  tools?: AnthropicTool[];
  signal?: AbortSignal;
}): AsyncGenerator<AnthropicStreamChunk> {
  const client = getClient(requestParams.backend);
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

  try {
    const finalMessage = await stream.finalMessage()
    const thinkingBlocks: ThinkingBlockData[] = []
    for (const block of finalMessage.content) {
      if (block.type === 'thinking') {
        thinkingBlocks.push({ type: 'thinking', thinking: block.thinking, signature: block.signature })
      } else if (block.type === 'redacted_thinking') {
        thinkingBlocks.push({ type: 'redacted_thinking', data: block.data })
      }
    }
    if (thinkingBlocks.length > 0) {
      yield { type: 'thinking_blocks', blocks: thinkingBlocks }
    }
  } catch {
    // finalMessage may fail if stream was aborted
  }
}

export function formatToolContinuation(
  assistantText: string,
  thinkingBlocks: ThinkingBlockData[],
  pendingToolCalls: PendingToolInvocation[],
  toolResults: ToolInvocationResult[],
): AnthropicMessage[] {
  const assistantContent: AnthropicContentBlock[] = []

  for (const block of thinkingBlocks) {
    assistantContent.push(block)
  }

  if (assistantText) {
    assistantContent.push({ type: 'text', text: assistantText })
  }

  for (const toolCall of pendingToolCalls) {
    assistantContent.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.args,
    })
  }

  type ToolResultContentItem =
    | { type: 'text'; text: string }
    | { type: 'image'; source: AnthropicImageSource }

  const toolResultContent: Array<{
    type: 'tool_result'
    tool_use_id: string
    content: string | ToolResultContentItem[]
  }> = toolResults.map((toolResult) => {
    try {
      const parsed = JSON.parse(toolResult.result)
      if (parsed.type === 'image' && parsed.data_url) {
        const base64Match = parsed.data_url.match(/^data:([^;]+);base64,(.+)$/)
        if (base64Match) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolResult.id,
            content: [
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: base64Match[1],
                  data: base64Match[2],
                },
              },
            ],
          }
        }
      }
    } catch {
      // Not JSON, use as plain text
    }

    return {
      type: 'tool_result' as const,
      tool_use_id: toolResult.id,
      content: toolResult.result,
    }
  })

  return [
    { role: 'assistant', content: assistantContent },
    { role: 'user', content: toolResultContent as AnthropicMessage['content'] },
  ]
}

type AnthropicChatProviderConfig = {
  model: string
  backend: AnthropicBackend
  tools: ChatTool[]
  systemPrompt?: string
}

export type ProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[]
  thinkingBlocks: ThinkingBlockData[]
}

export class AnthropicChatProvider {
  private readonly model: string
  private readonly backend: AnthropicBackend
  private readonly anthropicTools: AnthropicTool[] | undefined
  private readonly systemPrompt?: string

  constructor(config: AnthropicChatProviderConfig) {
    this.model = config.model
    this.backend = config.backend
    this.systemPrompt = config.systemPrompt
    this.anthropicTools = config.tools.length > 0
      ? convertToolsToAnthropic(config.tools)
      : undefined
  }

  async *run(
    messages: AnthropicMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, ProviderRunResult> {
    const systemBlocks: Array<{ type: 'text'; text: string }> = [
      { type: 'text', text: buildSystemPrompt() },
    ]
    if (this.systemPrompt?.trim()) {
      systemBlocks.push({ type: 'text', text: this.systemPrompt.trim() })
    }

    const pendingToolCalls: PendingToolInvocation[] = []
    let thinkingBlocks: ThinkingBlockData[] = []
    let currentToolId = ''
    let currentToolName = ''
    let currentToolJson = ''
    let stopReason = ''

    const emptyResult: ProviderRunResult = { pendingToolCalls: [], thinkingBlocks: [] }

    try {
      for await (const chunk of streamAnthropicCompletion({
        model: this.model,
        backend: this.backend,
        messages,
        system: systemBlocks,
        tools: this.anthropicTools,
        signal,
      })) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        if (chunk.type === 'text') {
          yield { type: 'content', content: chunk.text }
        } else if (chunk.type === 'thinking') {
          yield { type: 'thinking', content: chunk.thinking }
        } else if (chunk.type === 'thinking_blocks') {
          thinkingBlocks = chunk.blocks
        } else if (chunk.type === 'tool_use_start') {
          currentToolId = chunk.id
          currentToolName = chunk.name
          currentToolJson = ''
        } else if (chunk.type === 'tool_use_delta') {
          currentToolJson += chunk.partial_json
        } else if (chunk.type === 'stop') {
          stopReason = chunk.stop_reason
          if (currentToolId && currentToolName) {
            let toolArguments: Record<string, unknown> = {}
            try {
              toolArguments = JSON.parse(currentToolJson || '{}')
            } catch (error) {
              log('ANTHROPIC', 'Failed to parse tool arguments on stop chunk', {
                error,
                currentToolId,
                currentToolName,
                currentToolJson,
              })
            }
            pendingToolCalls.push({ id: currentToolId, name: currentToolName, args: toolArguments })
          }
          log('ANTHROPIC', 'Received stop chunk', {
            chunk,
            pendingTools: pendingToolCalls,
          })
        }
      }
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal?.aborted
      ) {
        return emptyResult
      }

      log('ANTHROPIC', 'Anthropic provider run failed', {
        error,
        model: this.model,
      })

      const errorMessage = error instanceof Error ? error.message : 'Failed to start Anthropic completion'
      yield {
        type: 'error',
        message: `错误：Anthropic 请求失败 (model=${this.model}): ${errorMessage}`,
      }
      return emptyResult
    }

    if (stopReason === 'end_turn' || pendingToolCalls.length === 0) {
      return emptyResult
    }

    return { pendingToolCalls, thinkingBlocks }
  }
}
