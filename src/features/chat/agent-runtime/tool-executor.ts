import { askUserQuestionsTool } from '@/features/chat/ask-user-questions/ask-user-questions';
import { fetchUrlTool } from './fetch-tool';
import {
  stringifyFetchClientPayload,
  parseSearchClientPayload,
  stringifySearchClientPayload,
} from '@/features/chat/research/search-result-payload';
import { searchTool } from '../research/search-tool';
import { renderTool } from '../artifact/render-tool';
import { getServerEnv } from '@/shared/worker/env';
import { log } from '@/features/chat/agent-runtime';
import type { ChatTool, ToolContext, ToolHandler } from './tool-types';
import type {
  PendingToolInvocation,
  ToolInvocationResult,
  ChatServerToClientEvent,
} from '@/features/chat/chat-api';

export const getAvailableTools = (): ChatTool[] => {
  const env = getServerEnv();
  const tools: ChatTool[] = [];

  tools.push(askUserQuestionsTool.spec);
  tools.push(fetchUrlTool.spec);
  tools.push(renderTool.spec);

  if (env.SERP_API_KEY) {
    tools.push(searchTool.spec);
  } else {
    log('TOOLS', 'Skipping tool: search (missing SERP_API_KEY)');
  }

  return tools;
};

export type ExecutedToolCallResult = {
  events: ChatServerToClientEvent[];
  result: ToolInvocationResult;
};

export const executeToolCall = async (
  toolcall: PendingToolInvocation,
  signal?: AbortSignal,
  context?: ToolContext,
): Promise<ExecutedToolCallResult> => {
  const events: ChatServerToClientEvent[] = [];

  const env = getServerEnv();
  const handleTool: ToolHandler | null =
    toolcall.name === 'fetch_url'
      ? fetchUrlTool.handler
      : toolcall.name === 'render'
        ? renderTool.handler
        : toolcall.name === 'search' && env.SERP_API_KEY
          ? searchTool.handler
          : null;
  let rawResult: string;

  if (!handleTool) {
    log('TOOLS', `Tool not available: ${toolcall.name}`);
    rawResult = `Error: Tool "${toolcall.name}" is not available.`;
  } else {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      rawResult = await handleTool(toolcall.args, signal, context);
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        signal?.aborted
      ) {
        rawResult = 'Error: Aborted';
      } else {
        log(
          'TOOLS',
          `Error calling tool "${toolcall.name}"`,
          typeof error === 'object' && error !== null
            ? (error as Error).stack || (error as Error).message
            : String(error),
        );
        rawResult = `Error executing ${toolcall.name}: ${
          typeof error === 'object' && error !== null ? (error as Error).message : String(error)
        }`;
      }
    }
  }

  let toolResult: { client: string; model: string };
  if (toolcall.name === 'search') {
    try {
      const parsed = JSON.parse(rawResult);
      if (typeof parsed !== 'object' || parsed === null) {
        toolResult = { client: rawResult, model: rawResult };
      } else {
        const clientPayload = parseSearchClientPayload(
          JSON.stringify((parsed as { client?: unknown }).client ?? {}),
        );
        const ai = (parsed as { ai?: unknown }).ai;
        if (!clientPayload || typeof ai !== 'string') {
          toolResult = { client: rawResult, model: rawResult };
        } else {
          toolResult = {
            client: stringifySearchClientPayload(clientPayload),
            model: ai,
          };
        }
      }
    } catch {
      toolResult = { client: rawResult, model: rawResult };
    }
  } else {
    let clientResult = rawResult;
    if (toolcall.name === 'fetch_url') {
      const text = rawResult.trim();
      const isFetchError = text && text.startsWith('Error');
      if (isFetchError) {
        clientResult = 'Error: Fetch failed';
      } else {
        try {
          const parsed = JSON.parse(rawResult);
          if (parsed.type === 'image' && parsed.data_url) {
            clientResult = JSON.stringify(parsed);
          } else {
            clientResult = stringifyFetchClientPayload({
              type: 'fetch_result',
            });
          }
        } catch {
          clientResult = stringifyFetchClientPayload({
            type: 'fetch_result',
          });
        }
      }
    }
    toolResult = { client: clientResult, model: rawResult };
  }

  if (toolcall.name === 'render') {
    events.push(
      toolResult.model.startsWith('Error:')
        ? {
            type: 'artifact_failed',
            artifactId: toolcall.id,
            message: toolResult.model,
          }
        : {
            type: 'artifact_completed',
            artifactId: toolcall.id,
          },
    );
  }

  events.push({
    type: 'tool_result',
    tool: toolcall.name,
    result: toolResult.client,
    callId: toolcall.id,
  });

  return {
    events,
    result: {
      id: toolcall.id,
      name: toolcall.name,
      result: toolResult.model,
    },
  };
};

export async function* executeToolsGen(
  toolCalls: PendingToolInvocation[],
  signal?: AbortSignal,
  context?: ToolContext,
): AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]> {
  const results: ToolInvocationResult[] = [];

  for (const toolcall of toolCalls) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const executedToolCall = await executeToolCall(toolcall, signal, context);
    for (const event of executedToolCall.events) {
      yield event;
    }
    results.push(executedToolCall.result);
  }

  return results;
}
