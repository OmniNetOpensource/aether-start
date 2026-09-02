import { isAbortError } from '@/backend/chat/abort';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, type BackendConfig } from './backend-config';
import { log, logProviderCommunication } from '../logger';
import { buildProviderErrorEvent } from './provider-error';
import { quotesToModelText } from '@/shared/conversations';
import { resolveAttachmentToBase64 } from '../attachment-utils';
import { RenderArtifactStreamParser } from '@/shared/chat/render-artifact-stream';
import type {
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from '@/shared/chat/chat-api';
import type { ChatTool } from '@/shared/chat/tool-types';
import type { SerializedMessage } from '@/shared/chat/message';
import type { ChatProvider, ChatProviderConfig, ProviderRunResult } from './provider-types';

type AnthropicImageSource = {
  type: 'base64';
  media_type: string;
  data: string;
};

type AnthropicToolResultContentItem =
  | { type: 'text'; text: string }
  | { type: 'image'; source: AnthropicImageSource };

const SUPPORTED_TOOL_RESULT_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export type ThinkingBlockData =
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string };

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: AnthropicImageSource }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string | AnthropicToolResultContentItem[];
      is_error?: boolean;
    }
  | ThinkingBlockData;

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; partial_json: string }
  | { type: 'stop'; stop_reason: string }
  | { type: 'thinking_blocks'; blocks: ThinkingBlockData[] };

class AnthropicStreamError extends Error {
  readonly status: number | undefined;

  constructor(
    error: unknown,
    readonly stream: {
      requestId: string | null | undefined;
      phase: string;
      stopReason: string | null;
      eventCount: number;
      openContentBlockCount: number;
      durationMs: number;
      msSinceLastEvent: number | null;
    },
  ) {
    super(error instanceof Error ? error.message : 'Anthropic stream failed', { cause: error });
    this.name = error instanceof Error ? error.name : 'AnthropicStreamError';
    this.status =
      error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : undefined;
  }
}

const THINKING_BUDGET_RATIO = 0.8;
const THINKING_MIN_BUDGET_TOKENS = 1024;
const ADAPTIVE_THINKING_MODELS = new Set(['claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8']);

const getClient = (config: BackendConfig) => {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders,
  });
};

type AnthropicThinkingParams =
  | {
      thinking: {
        type: 'adaptive';
      };
      output_config: {
        effort: 'high';
      };
    }
  | {
      thinking: {
        type: 'enabled';
        budget_tokens: number;
      };
    };

const getMaxOutputTokens = (model: string) => {
  if (ADAPTIVE_THINKING_MODELS.has(model)) {
    return 128000;
  }

  if (
    model === 'claude-opus-4-5-20251101' ||
    model === 'claude-sonnet-4-6' ||
    model === 'claude-sonnet-5' ||
    model === 'claude-haiku-4-5-20251001'
  ) {
    return 64000;
  }

  throw new Error(`Unsupported Anthropic model: ${model}`);
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
  if (ADAPTIVE_THINKING_MODELS.has(model)) {
    return {
      thinking: {
        type: 'adaptive',
      },
      output_config: {
        effort: 'high',
      },
    };
  }

  return {
    thinking: {
      type: 'enabled',
      budget_tokens: getThinkingBudgetTokens(maxTokens),
    },
  };
};

export async function convertToAnthropicMessages(
  history: SerializedMessage[],
): Promise<AnthropicMessage[]> {
  return Promise.all(
    history.map(async (message, msgIdx) => {
      const contentBlocks: AnthropicContentBlock[] = [];

      for (const block of message.blocks) {
        if (block.type === 'quotes' && block.quotes.length > 0) {
          const quoteText = quotesToModelText(block.quotes);
          if (quoteText) {
            contentBlocks.push({ type: 'text', text: quoteText });
          }
        } else if (block.type === 'content' && block.content) {
          contentBlocks.push({ type: 'text', text: block.content });
        } else if (block.type === 'attachments') {
          for (const attachment of block.attachments) {
            if (attachment.kind === 'image') {
              const resolved = await resolveAttachmentToBase64('ANTHROPIC', {
                name: attachment.name,
                mimeType: attachment.mimeType,
                url: attachment.url,
                storageKey: attachment.storageKey,
              });

              if (resolved) {
                contentBlocks.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: resolved.media_type,
                    data: resolved.data,
                  },
                });
              } else {
                log('ANTHROPIC', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`);
              }
            }
          }
        }
      }

      return {
        role: message.role,
        content: contentBlocks.length > 0 ? contentBlocks : '',
      };
    }),
  );
}

function convertToolsToAnthropic(tools: ChatTool[]): AnthropicTool[] {
  return tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters as Record<string, unknown>,
    }));
}

async function* streamAnthropicCompletion(requestParams: {
  model: string;
  backendConfig: BackendConfig;
  messages: AnthropicMessage[];
  system?: Array<{ type: 'text'; text: string }>;
  tools?: AnthropicTool[];
  signal?: AbortSignal;
}): AsyncGenerator<AnthropicStreamChunk> {
  const client = getClient(requestParams.backendConfig);
  const maxTokens = getMaxOutputTokens(requestParams.model);
  const thinkingParams = buildThinkingParams(requestParams.model, maxTokens);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamParams: any = {
    model: requestParams.model,
    messages: requestParams.messages as Anthropic.MessageParam[],
    system: requestParams.system,
    tools: requestParams.tools as Anthropic.Tool[],
    max_tokens: maxTokens,
    ...thinkingParams,
  };

  logProviderCommunication('anthropic', 'Messages request', {
    model: requestParams.model,
    body: streamParams,
  });

  const stream = client.messages.stream(streamParams, {
    signal: requestParams.signal,
  });

  const startedAt = Date.now();
  const openContentBlocks = new Set<number>();
  let eventCount = 0;
  let lastEventAt: number | undefined;
  let stopReason: string | null = null;
  let completedMessage: Anthropic.Message | undefined;

  try {
    for await (const event of stream) {
      if (requestParams.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      eventCount += 1;
      lastEventAt = Date.now();

      logProviderCommunication('anthropic', 'Stream event', {
        model: requestParams.model,
        event,
      });

      if (event.type === 'content_block_start') {
        openContentBlocks.add(event.index);
        if (event.content_block.type === 'tool_use') {
          yield {
            type: 'tool_use_start',
            id: event.content_block.id,
            name: event.content_block.name,
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield {
            type: 'tool_use_delta',
            partial_json: event.delta.partial_json,
          };
        } else if (event.delta.type === 'thinking_delta') {
          yield {
            type: 'thinking',
            thinking: event.delta.thinking,
          };
        }
      } else if (event.type === 'content_block_stop') {
        openContentBlocks.delete(event.index);
      } else if (event.type === 'message_delta') {
        if (event.delta.stop_reason) {
          stopReason = event.delta.stop_reason;
          yield { type: 'stop', stop_reason: event.delta.stop_reason };
        }
      } else if (event.type === 'message_stop') {
        if (!stopReason || openContentBlocks.size > 0 || !stream.currentMessage) {
          throw new Error('Anthropic stream ended before all content blocks were complete');
        }

        completedMessage = stream.currentMessage;
        break;
      }
    }

    if (!completedMessage) {
      completedMessage = await stream.finalMessage();
    }
  } catch (error) {
    const now = Date.now();
    const streamState = {
      requestId: stream.request_id,
      phase: stopReason ? 'after_stop_reason' : eventCount > 0 ? 'streaming' : 'before_first_event',
      stopReason,
      eventCount,
      openContentBlockCount: openContentBlocks.size,
      durationMs: now - startedAt,
      msSinceLastEvent: lastEventAt === undefined ? null : now - lastEventAt,
    };
    const message = stream.currentMessage;
    const networkConnectionLost =
      error instanceof Error &&
      (error.message === 'Network connection lost.' ||
        (error.cause instanceof Error && error.cause.message === 'Network connection lost.'));

    if (networkConnectionLost && stopReason && openContentBlocks.size === 0 && message) {
      completedMessage = message;
      log('ANTHROPIC', 'Recovered completed Anthropic stream after connection loss', {
        error,
        model: requestParams.model,
        stream: streamState,
      });
    } else {
      throw new AnthropicStreamError(error, streamState);
    }
  }

  if (!completedMessage) {
    throw new Error('Anthropic stream completed without a message');
  }

  const thinkingBlocks: ThinkingBlockData[] = [];
  for (const block of completedMessage.content) {
    if (block.type === 'thinking') {
      thinkingBlocks.push({
        type: 'thinking',
        thinking: block.thinking,
        signature: block.signature,
      });
    } else if (block.type === 'redacted_thinking') {
      thinkingBlocks.push({ type: 'redacted_thinking', data: block.data });
    }
  }
  if (thinkingBlocks.length > 0) {
    yield { type: 'thinking_blocks', blocks: thinkingBlocks };
  }
}

export function formatToolContinuation(
  assistantText: string,
  thinkingBlocks: ThinkingBlockData[],
  pendingToolCalls: PendingToolInvocation[],
  toolResults: ToolInvocationResult[],
): AnthropicMessage[] {
  const assistantContent: AnthropicContentBlock[] = [];

  for (const block of thinkingBlocks) {
    assistantContent.push(block);
  }

  if (assistantText) {
    assistantContent.push({ type: 'text', text: assistantText });
  }

  for (const toolCall of pendingToolCalls) {
    assistantContent.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.args,
    });
  }

  const toolResultContent: AnthropicContentBlock[] = toolResults.map((toolResult) => {
    try {
      const parsed = JSON.parse(toolResult.result);
      if (parsed.type === 'image' && parsed.data_url) {
        const base64Match = parsed.data_url.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
          const mediaType = base64Match[1];
          if (!SUPPORTED_TOOL_RESULT_IMAGE_MEDIA_TYPES.has(mediaType)) {
            log('ANTHROPIC', 'Skipping unsupported tool_result image media type', {
              toolUseId: toolResult.id,
              mediaType,
              toolName: toolResult.name,
            });
            return {
              type: 'tool_result' as const,
              tool_use_id: toolResult.id,
              is_error: true,
              content:
                `Unsupported image format for Anthropic tool_result: ${mediaType}. ` +
                'Anthropic supports image/jpeg, image/png, image/gif, and image/webp.',
            };
          }

          return {
            type: 'tool_result' as const,
            tool_use_id: toolResult.id,
            content: [
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: mediaType,
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
      type: 'tool_result' as const,
      tool_use_id: toolResult.id,
      content: toolResult.result,
    };
  });

  return [
    { role: 'assistant', content: assistantContent },
    { role: 'user', content: toolResultContent },
  ];
}

type AnthropicChatProviderConfig = {
  model: string;
  backendConfig: BackendConfig;
  tools: ChatTool[];
  systemPrompt: string;
};

export class AnthropicChatProvider {
  private readonly model: string;
  private readonly backendConfig: BackendConfig;
  private readonly anthropicTools: AnthropicTool[] | undefined;
  private readonly systemPrompt: string;

  constructor(config: AnthropicChatProviderConfig) {
    this.model = config.model;
    this.backendConfig = config.backendConfig;
    this.systemPrompt = config.systemPrompt;
    this.anthropicTools =
      config.tools.length > 0 ? convertToolsToAnthropic(config.tools) : undefined;
  }

  async *run(
    messages: AnthropicMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, ProviderRunResult> {
    const systemBlocks: Array<{ type: 'text'; text: string }> = [
      { type: 'text', text: buildSystemPrompt() },
    ];
    if (this.systemPrompt.trim()) {
      systemBlocks.push({ type: 'text', text: this.systemPrompt.trim() });
    }

    const pendingToolCalls: PendingToolInvocation[] = [];
    let thinkingBlocks: ThinkingBlockData[] = [];
    let currentToolId = '';
    let currentToolName = '';
    let currentToolJson = '';
    let currentRenderParser: RenderArtifactStreamParser | null = null;
    let assistantText = '';

    const emptyResult: ProviderRunResult = {
      pendingToolCalls: [],
      thinkingBlocks: [],
      assistantText: '',
    };

    try {
      for await (const chunk of streamAnthropicCompletion({
        model: this.model,
        backendConfig: this.backendConfig,
        messages,
        system: systemBlocks,
        tools: this.anthropicTools,
        signal,
      })) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        if (chunk.type === 'text') {
          assistantText += chunk.text;
          yield { type: 'content', content: chunk.text };
        } else if (chunk.type === 'thinking') {
          yield { type: 'thinking', content: chunk.thinking };
        } else if (chunk.type === 'thinking_blocks') {
          thinkingBlocks = chunk.blocks;
        } else if (chunk.type === 'tool_use_start') {
          currentToolId = chunk.id;
          currentToolName = chunk.name;
          currentToolJson = '';
          currentRenderParser =
            chunk.name === 'render' ? new RenderArtifactStreamParser(chunk.id) : null;
          if (currentRenderParser) {
            for (const event of currentRenderParser.start()) {
              yield event;
            }
          }
        } else if (chunk.type === 'tool_use_delta') {
          currentToolJson += chunk.partial_json;
          if (currentRenderParser) {
            for (const event of currentRenderParser.append(chunk.partial_json)) {
              yield event;
            }
          }
        } else if (chunk.type === 'stop') {
          if (chunk.stop_reason === 'tool_use') {
            if (!currentToolId || !currentToolName) {
              throw new Error('Anthropic stopped for tool use without a complete tool call');
            }

            const parsedToolArguments: unknown = JSON.parse(currentToolJson || '{}');
            if (
              !parsedToolArguments ||
              typeof parsedToolArguments !== 'object' ||
              Array.isArray(parsedToolArguments)
            ) {
              throw new Error('Anthropic returned invalid tool arguments');
            }
            const toolArguments = { ...parsedToolArguments };
            if (currentRenderParser) {
              for (const event of currentRenderParser.finalize(toolArguments)) {
                yield event;
              }
            }
            pendingToolCalls.push({
              id: currentToolId,
              name: currentToolName,
              args: toolArguments,
            });
            yield {
              type: 'tool_call',
              tool: currentToolName,
              args: toolArguments,
              callId: currentToolId,
            };
          }
          log('ANTHROPIC', 'Received stop chunk', {
            stopReason: chunk.stop_reason,
            pendingToolCount: pendingToolCalls.length,
          });
        }
      }
    } catch (error) {
      if (isAbortError(error, signal)) {
        return emptyResult;
      }

      log('ANTHROPIC', 'Anthropic provider run failed', {
        error,
        model: this.model,
        backend: this.backendConfig.baseURL,
        stream: error instanceof AnthropicStreamError ? error.stream : undefined,
      });

      yield buildProviderErrorEvent({
        provider: 'anthropic',
        model: this.model,
        backendConfig: this.backendConfig,
        error,
        fallbackMessage: 'Failed to start Anthropic completion',
      });
      return emptyResult;
    }

    return { pendingToolCalls, thinkingBlocks, assistantText };
  }
}

export function createAnthropicAdapter(config: ChatProviderConfig): ChatProvider<AnthropicMessage> {
  const provider = new AnthropicChatProvider(config);
  return {
    convertMessages: (history) => convertToAnthropicMessages(history),
    run: (messages, signal) => provider.run(messages, signal),
    formatToolContinuation: (runResult, toolResults) =>
      formatToolContinuation(
        runResult.assistantText,
        runResult.thinkingBlocks as ThinkingBlockData[],
        runResult.pendingToolCalls,
        toolResults,
      ),
  };
}
