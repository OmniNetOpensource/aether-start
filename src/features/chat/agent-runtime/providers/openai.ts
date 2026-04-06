import OpenAI from 'openai';
import { buildSystemPrompt, type BackendConfig } from './backend-config';
import { log, logProviderCommunication, shouldLogProviderCommunication } from '../logger';
import { quotesToModelText } from '@/features/conversations/conversation-tree';
import { buildProviderErrorEvent } from './provider-error';
import { resolveAttachmentToBase64 } from '../attachment-utils';
import { parseToolResultImage } from '../tool-result-images';
import { RenderArtifactStreamParser } from '../../artifact/render-artifact-stream';
import type {
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from '@/features/chat/session';
import type { ChatTool } from '../tool-types';
import type { SerializedMessage } from '@/features/chat/message-thread';
import type { ChatProvider, ChatProviderConfig } from './provider-types';

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[];
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type OpenAITool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenAIProviderRunResult = {
  pendingToolCalls: PendingToolInvocation[];
  thinkingBlocks: unknown[];
};

type OpenAIChatProviderConfig = {
  model: string;
  backendConfig: BackendConfig;
  tools: ChatTool[];
  systemPrompt: string;
};

const serializeHeaders = (headers: HeadersInit | undefined): Record<string, string> | undefined => {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
};

const createLoggingFetch = (provider: 'openai' | 'openai-responses'): typeof fetch => {
  return async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let requestBody: unknown;
    try {
      requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    } catch {
      requestBody = init?.body;
    }

    const isStreamingRequest =
      !!requestBody &&
      typeof requestBody === 'object' &&
      (requestBody as { stream?: unknown }).stream === true;

    if (isStreamingRequest && shouldLogProviderCommunication(provider)) {
      logProviderCommunication(provider, 'HTTP Request', {
        method: init?.method ?? 'GET',
        url,
        headers: serializeHeaders(init?.headers),
        body: requestBody,
      });
    }

    const response = await fetch(input, init);

    if (isStreamingRequest && shouldLogProviderCommunication(provider)) {
      logProviderCommunication(provider, 'HTTP Response', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    }

    return response;
  };
};

export const getOpenAIClient = (
  config: BackendConfig,
  provider: 'openai' | 'openai-responses' = 'openai',
) => {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders,
    fetch: createLoggingFetch(provider),
  });
};

const convertToolsToOpenAI = (tools: ChatTool[]): OpenAITool[] => {
  return tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as Record<string, unknown>,
      },
    }));
};

const extractThinkingTexts = (delta: Record<string, unknown>): string[] => {
  const thinkingTexts: string[] = [];

  const tryPush = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      thinkingTexts.push(value);
    }
  };

  tryPush(delta.thinking);
  tryPush(delta.reasoning);
  tryPush(delta.reasoning_content);

  const detailCandidates = [
    delta.reasoning_details,
    delta.reasoningDetails,
    delta.thinking_details,
  ];

  for (const candidate of detailCandidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    for (const item of candidate) {
      if (typeof item === 'string') {
        tryPush(item);
        continue;
      }

      if (item && typeof item === 'object') {
        const detail = item as Record<string, unknown>;
        tryPush(detail.text);
        tryPush(detail.content);
      }
    }
  }

  return thinkingTexts;
};

export async function convertToOpenAIMessages(
  history: SerializedMessage[],
): Promise<OpenAIMessage[]> {
  return Promise.all(
    history.map(async (message, msgIdx) => {
      const contentParts: OpenAIContentPart[] = [];

      for (const block of message.blocks) {
        if (block.type === 'quotes' && block.quotes.length > 0) {
          const quoteText = quotesToModelText(block.quotes);
          if (quoteText) {
            contentParts.push({ type: 'text', text: quoteText });
          }
        } else if (block.type === 'content' && block.content) {
          contentParts.push({ type: 'text', text: block.content });
        } else if (block.type === 'attachments') {
          for (const attachment of block.attachments) {
            if (attachment.kind !== 'image') {
              continue;
            }

            const resolved = await resolveAttachmentToBase64('OPENAI', {
              name: attachment.name,
              mimeType: attachment.mimeType,
              url: attachment.url,
              storageKey: attachment.storageKey,
            });

            if (resolved) {
              contentParts.push({
                type: 'image_url',
                image_url: {
                  url: `data:${resolved.media_type};base64,${resolved.data}`,
                },
              });
            } else {
              log('OPENAI', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`);
            }
          }
        }
      }

      return {
        role: message.role,
        content: contentParts.length > 0 ? contentParts : '',
      };
    }),
  );
}

export function formatOpenAIToolContinuation(
  assistantText: string,
  pendingToolCalls: PendingToolInvocation[],
  toolResults: ToolInvocationResult[],
): OpenAIMessage[] {
  const assistantToolCalls = pendingToolCalls.map((toolCall, index) => ({
    id: toolCall.id || `tool_${index + 1}`,
    type: 'function' as const,
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.args ?? {}),
    },
  }));

  const assistantMessage: OpenAIMessage = {
    role: 'assistant',
    content: assistantText || '',
    tool_calls: assistantToolCalls,
  };

  const toolMessages: OpenAIMessage[] = toolResults.map((toolResult, index) => ({
    role: 'tool',
    tool_call_id: toolResult.id || assistantToolCalls[index]?.id || `tool_${index + 1}`,
    content: toolResult.result,
  }));

  const toolResultImageParts: OpenAIContentPart[] = toolResults.flatMap((toolResult) => {
    const image = parseToolResultImage(toolResult.result);
    if (!image) {
      return [];
    }

    return [
      {
        type: 'text',
        text: `Image returned by tool ${toolResult.name}. Use it when answering.`,
      },
      {
        type: 'image_url',
        image_url: {
          url: image.dataUrl,
        },
      },
    ];
  });

  const imageMessage: OpenAIMessage[] =
    toolResultImageParts.length > 0
      ? [
          {
            role: 'user',
            content: toolResultImageParts,
          },
        ]
      : [];

  return [assistantMessage, ...toolMessages, ...imageMessage];
}

export class OpenAIChatProvider {
  private readonly model: string;
  private readonly backendConfig: BackendConfig;
  private readonly openaiTools: OpenAITool[] | undefined;
  private readonly systemPrompt: string;

  constructor(config: OpenAIChatProviderConfig) {
    this.model = config.model;
    this.backendConfig = config.backendConfig;
    this.systemPrompt = config.systemPrompt;
    this.openaiTools = config.tools.length > 0 ? convertToolsToOpenAI(config.tools) : undefined;
  }

  async *run(
    messages: OpenAIMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, OpenAIProviderRunResult> {
    const systemParts = [buildSystemPrompt()];
    if (this.systemPrompt.trim()) {
      systemParts.push(this.systemPrompt.trim());
    }

    const fullMessages: OpenAIMessage[] = [
      { role: 'system', content: systemParts.join('\n\n') },
      ...messages,
    ];

    const emptyResult: OpenAIProviderRunResult = {
      pendingToolCalls: [],
      thinkingBlocks: [],
    };
    const toolCallsByIndex = new Map<number, { id: string; name: string; argsJson: string }>();
    const renderParsers = new Map<number, RenderArtifactStreamParser>();

    try {
      const client = getOpenAIClient(this.backendConfig, 'openai');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamParams: any = {
        model: this.model,
        messages: fullMessages,
        tools: this.openaiTools,
        stream: true,
      };

      const streamResponse = await client.chat.completions.create(streamParams, {
        signal,
      });

      const stream = streamResponse as unknown as AsyncIterable<{
        choices?: Array<{ delta?: Record<string, unknown> }>;
      }>;

      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        logProviderCommunication('openai', 'Stream chunk', {
          model: this.model,
          chunk,
        });

        const choice = chunk.choices?.[0];
        if (!choice) {
          continue;
        }

        const delta = (choice.delta ?? {}) as Record<string, unknown>;
        const deltaContent = delta.content;
        if (typeof deltaContent === 'string' && deltaContent.length > 0) {
          yield { type: 'content', content: deltaContent };
        }

        const thinkingTexts = extractThinkingTexts(delta);
        for (const text of thinkingTexts) {
          yield { type: 'thinking', content: text };
        }

        const deltaToolCalls = Array.isArray((delta as { tool_calls?: unknown[] }).tool_calls)
          ? ((delta as { tool_calls: unknown[] }).tool_calls as Array<Record<string, unknown>>)
          : [];

        for (const toolCall of deltaToolCalls) {
          const index = typeof toolCall.index === 'number' ? toolCall.index : 0;
          const existing = toolCallsByIndex.get(index) ?? {
            id: '',
            name: '',
            argsJson: '',
          };

          if (typeof toolCall.id === 'string' && toolCall.id.length > 0) {
            existing.id = toolCall.id;
          }

          const functionInfo = toolCall.function;
          if (functionInfo && typeof functionInfo === 'object') {
            const fn = functionInfo as Record<string, unknown>;
            if (typeof fn.name === 'string' && fn.name.length > 0) {
              existing.name = fn.name;
            }
            if (typeof fn.arguments === 'string' && fn.arguments.length > 0) {
              existing.argsJson += fn.arguments;
              if (existing.name === 'render') {
                const parser =
                  renderParsers.get(index) ??
                  new RenderArtifactStreamParser(existing.id || `tool_${index + 1}`);
                renderParsers.set(index, parser);
                for (const event of parser.append(fn.arguments)) {
                  yield event;
                }
              }
            }
          }

          toolCallsByIndex.set(index, existing);
        }
      }
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal?.aborted
      ) {
        return emptyResult;
      }

      log('OPENAI', 'OpenAI provider run failed', {
        error,
        model: this.model,
      });

      yield buildProviderErrorEvent({
        provider: 'openai',
        model: this.model,
        backendConfig: this.backendConfig,
        error,
        fallbackMessage: 'Failed to start OpenAI completion',
      });
      return emptyResult;
    }

    log('OPENAI', 'Stream completed', {
      model: this.model,
      toolCallCount: toolCallsByIndex.size,
    });

    const pendingToolCalls: PendingToolInvocation[] = [...toolCallsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, toolCall]) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.argsJson || '{}');
        } catch (error) {
          log('OPENAI', 'Failed to parse tool arguments', {
            error,
            index,
            toolCall,
          });
        }

        return {
          id: toolCall.id || `tool_${index + 1}`,
          name: toolCall.name || 'unknown_tool',
          args,
        };
      });

    for (const [index, toolCall] of [...toolCallsByIndex.entries()].sort(([a], [b]) => a - b)) {
      if (toolCall.name !== 'render') {
        continue;
      }

      const parser =
        renderParsers.get(index) ??
        new RenderArtifactStreamParser(toolCall.id || `tool_${index + 1}`);
      for (const event of parser.finalize(
        pendingToolCalls.find((item) => item.id === (toolCall.id || `tool_${index + 1}`))?.args ??
          {},
      )) {
        yield event;
      }
    }

    return { pendingToolCalls, thinkingBlocks: [] };
  }
}

export function createOpenAIAdapter(config: ChatProviderConfig): ChatProvider<OpenAIMessage> {
  const provider = new OpenAIChatProvider(config);
  return {
    convertMessages: (history) => convertToOpenAIMessages(history),
    run: (messages, signal) => provider.run(messages, signal),
    formatToolContinuation: (assistantText, _runResult, pendingToolCalls, toolResults) =>
      formatOpenAIToolContinuation(assistantText, pendingToolCalls, toolResults),
  };
}
