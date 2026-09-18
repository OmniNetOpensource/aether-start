import { isAbortError } from '@/backend/chat/abort';
import OpenAI from 'openai';
import { buildSystemPrompt, type BackendConfig } from './backend-config';
import { log, logProviderCommunication } from '../logger';
import { quotesToModelText } from '@/shared/conversations';
import { buildProviderErrorEvent } from './provider-error';
import { resolveAttachmentToBase64 } from '../attachment-utils';
import { parseToolResultImage } from '../tool-result-images';
import { getOpenAIClient } from './openai';
import type {
  PendingToolInvocation,
  ChatServerToClientEvent,
  ToolInvocationResult,
} from '@/shared/chat/chat-api';
import type { ChatTool } from '@/shared/chat/tool-types';
import type { SerializedMessage } from '@/shared/chat/message';
import type { ChatProvider, ChatProviderConfig, ProviderRunResult } from './provider-types';

export type OpenAIResponsesMessage = OpenAI.Responses.ResponseInputItem;

type OpenAIResponsesChatProviderConfig = {
  model: string;
  backendConfig: BackendConfig;
  tools: ChatTool[];
  systemPrompt: string;
};

type AccumulatedToolCall = {
  callId: string;
  name: string;
  argsJson: string;
};

const convertToolsToOpenAIResponses = (tools: ChatTool[]): OpenAI.Responses.FunctionTool[] => {
  return tools
    .filter((tool) => tool.type === 'function')
    .map((tool) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters as Record<string, unknown>,
      strict: true,
    }));
};

export async function convertToOpenAIResponsesMessages(
  history: SerializedMessage[],
): Promise<OpenAIResponsesMessage[]> {
  return Promise.all(
    history.map(async (message, msgIdx) => {
      const contentItems: OpenAI.Responses.ResponseInputContent[] = [];

      for (const block of message.blocks) {
        if (block.type === 'quotes' && block.quotes.length > 0) {
          const quoteText = quotesToModelText(block.quotes);
          if (quoteText) {
            contentItems.push({
              type: 'input_text',
              text: quoteText,
            });
          }
        } else if (block.type === 'content' && block.content) {
          contentItems.push({
            type: 'input_text',
            text: block.content,
          });
        } else if (block.type === 'attachments') {
          for (const attachment of block.attachments) {
            if (attachment.kind !== 'image') {
              continue;
            }

            const resolved = await resolveAttachmentToBase64('OPENAI_RESPONSES', {
              name: attachment.name,
              mimeType: attachment.mimeType,
              url: attachment.url,
              storageKey: attachment.storageKey,
            });

            if (resolved) {
              contentItems.push({
                type: 'input_image',
                detail: 'auto',
                image_url: `data:${resolved.media_type};base64,${resolved.data}`,
              });
            } else {
              log('OPENAI_RESPONSES', `消息 ${msgIdx + 1}: 附件 ${attachment.name} 解析失败`);
            }
          }
        }
      }

      const easyMessage: OpenAI.Responses.EasyInputMessage = {
        type: 'message',
        role: message.role,
        content:
          contentItems.length === 0
            ? ''
            : contentItems.length === 1 && contentItems[0]?.type === 'input_text'
              ? contentItems[0].text
              : contentItems,
      };

      return easyMessage;
    }),
  );
}

const upsertToolCall = (
  toolCallsByOutputIndex: Map<number, AccumulatedToolCall>,
  outputIndex: number,
): AccumulatedToolCall => {
  const existing = toolCallsByOutputIndex.get(outputIndex);
  if (existing) {
    return existing;
  }

  const created: AccumulatedToolCall = {
    callId: crypto.randomUUID(),
    name: '',
    argsJson: '',
  };
  toolCallsByOutputIndex.set(outputIndex, created);
  return created;
};

const applyFunctionCallItem = (
  toolCallsByOutputIndex: Map<number, AccumulatedToolCall>,
  outputIndex: number,
  item: OpenAI.Responses.ResponseOutputItem,
) => {
  if (item.type !== 'function_call') {
    return;
  }

  const toolCall = upsertToolCall(toolCallsByOutputIndex, outputIndex);
  if (typeof item.call_id === 'string' && item.call_id.length > 0) {
    toolCall.callId = item.call_id;
  }
  if (typeof item.name === 'string' && item.name.length > 0) {
    toolCall.name = item.name;
  }
  if (typeof item.arguments === 'string' && item.arguments.length > 0) {
    toolCall.argsJson = item.arguments;
  }
};

export function formatOpenAIResponsesToolContinuation(
  assistantText: string,
  pendingToolCalls: PendingToolInvocation[],
  toolResults: ToolInvocationResult[],
): OpenAIResponsesMessage[] {
  const assistantMessages: OpenAI.Responses.EasyInputMessage[] = assistantText
    ? [
        {
          type: 'message',
          role: 'assistant',
          content: assistantText,
        },
      ]
    : [];

  const functionCallItems: OpenAI.Responses.ResponseFunctionToolCall[] = pendingToolCalls.map(
    (toolCall, index) => ({
      type: 'function_call',
      call_id: toolCall.id || `tool_${index + 1}`,
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.args ?? {}),
    }),
  );

  const functionCallOutputItems: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] =
    toolResults.map((toolResult, index) => ({
      type: 'function_call_output',
      call_id: toolResult.id || pendingToolCalls[index]?.id || `tool_${index + 1}`,
      output: toolResult.result,
    }));

  const toolResultImageContent: OpenAI.Responses.ResponseInputContent[] = toolResults.flatMap(
    (toolResult) => {
      const image = parseToolResultImage(toolResult.result);
      if (!image) {
        return [];
      }

      return [
        {
          type: 'input_text',
          text: `Image returned by tool ${toolResult.name}. Use it when answering.`,
        },
        {
          type: 'input_image',
          detail: 'auto',
          image_url: image.dataUrl,
        },
      ];
    },
  );

  const imageMessage: OpenAI.Responses.EasyInputMessage[] =
    toolResultImageContent.length > 0
      ? [
          {
            type: 'message',
            role: 'user',
            content: toolResultImageContent,
          },
        ]
      : [];

  return [...assistantMessages, ...functionCallItems, ...functionCallOutputItems, ...imageMessage];
}

export class OpenAIResponsesChatProvider {
  private readonly model: string;
  private readonly backendConfig: BackendConfig;
  private readonly openaiTools: OpenAI.Responses.FunctionTool[] | undefined;
  private readonly systemPrompt: string;

  constructor(config: OpenAIResponsesChatProviderConfig) {
    this.model = config.model;
    this.backendConfig = config.backendConfig;
    this.systemPrompt = config.systemPrompt;
    this.openaiTools =
      config.tools.length > 0 ? convertToolsToOpenAIResponses(config.tools) : undefined;
  }

  async *run(
    messages: OpenAIResponsesMessage[],
    signal?: AbortSignal,
  ): AsyncGenerator<ChatServerToClientEvent, ProviderRunResult> {
    const systemParts = [buildSystemPrompt()];
    if (this.systemPrompt.trim()) {
      systemParts.push(this.systemPrompt.trim());
    }

    const streamParams: OpenAI.Responses.ResponseCreateParamsStreaming = this.openaiTools
      ? {
          model: this.model,
          input: messages,
          instructions: systemParts.join('\n\n'),
          tools: this.openaiTools,
          stream: true,
        }
      : {
          model: this.model,
          input: messages,
          instructions: systemParts.join('\n\n'),
          stream: true,
        };

    const emptyResult: ProviderRunResult = {
      pendingToolCalls: [],
      thinkingBlocks: [],
      assistantText: '',
    };
    const toolCallsByOutputIndex = new Map<number, AccumulatedToolCall>();
    let assistantText = '';

    try {
      const client = getOpenAIClient(this.backendConfig, 'openai-responses');
      const stream = await client.responses.create(streamParams, { signal });

      for await (const event of stream) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        logProviderCommunication('openai-responses', 'Stream event', {
          model: this.model,
          event,
        });

        if (event.type === 'response.output_text.delta' && event.delta) {
          assistantText += event.delta;
          yield { type: 'content', content: event.delta };
          continue;
        }

        if (
          (event.type === 'response.reasoning_text.delta' ||
            event.type === 'response.reasoning_summary_text.delta') &&
          event.delta
        ) {
          yield { type: 'thinking', content: event.delta };
          continue;
        }

        if (
          event.type === 'response.output_item.added' ||
          event.type === 'response.output_item.done'
        ) {
          applyFunctionCallItem(toolCallsByOutputIndex, event.output_index, event.item);
          continue;
        }

        if (event.type === 'response.function_call_arguments.delta') {
          const toolCall = upsertToolCall(toolCallsByOutputIndex, event.output_index);
          toolCall.argsJson += event.delta;
          continue;
        }

        if (event.type === 'response.function_call_arguments.done') {
          const toolCall = upsertToolCall(toolCallsByOutputIndex, event.output_index);
          toolCall.argsJson = event.arguments;
          continue;
        }

        if (event.type === 'error') {
          yield buildProviderErrorEvent({
            provider: 'openai-responses',
            model: this.model,
            backendConfig: this.backendConfig,
            error: new Error(event.message),
            fallbackMessage: 'OpenAI Responses stream event failed',
          });
        }
      }
    } catch (error) {
      if (isAbortError(error, signal)) {
        return emptyResult;
      }

      log('OPENAI_RESPONSES', 'OpenAI Responses provider run failed', {
        error,
        model: this.model,
      });

      yield buildProviderErrorEvent({
        provider: 'openai-responses',
        model: this.model,
        backendConfig: this.backendConfig,
        error,
        fallbackMessage: 'Failed to start OpenAI Responses completion',
      });
      return emptyResult;
    }

    log('OPENAI_RESPONSES', 'Stream completed', {
      model: this.model,
      toolCallCount: toolCallsByOutputIndex.size,
    });

    const pendingToolCalls: PendingToolInvocation[] = [...toolCallsByOutputIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, toolCall]) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.argsJson || '{}');
        } catch (error) {
          log('OPENAI_RESPONSES', 'Failed to parse tool arguments', {
            error,
            index,
            toolCall,
          });
        }

        return {
          id: toolCall.callId || `tool_${index + 1}`,
          name: toolCall.name || 'unknown_tool',
          args,
        };
      });

    for (const tc of pendingToolCalls) {
      yield { type: 'tool_call', tool: tc.name, args: tc.args, callId: tc.id };
    }

    return { pendingToolCalls, thinkingBlocks: [], assistantText };
  }
}

export function createOpenAIResponsesAdapter(
  config: ChatProviderConfig,
): ChatProvider<OpenAIResponsesMessage> {
  const provider = new OpenAIResponsesChatProvider(config);
  return {
    convertMessages: (history) => convertToOpenAIResponsesMessages(history),
    run: (messages, signal) => provider.run(messages, signal),
    formatToolContinuation: (runResult, toolResults) =>
      formatOpenAIResponsesToolContinuation(
        runResult.assistantText,
        runResult.pendingToolCalls,
        toolResults,
      ),
  };
}
