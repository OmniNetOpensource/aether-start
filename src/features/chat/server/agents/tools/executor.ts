import { fetchUrlTool } from './fetch';
import {
  stringifyFetchClientPayload,
  parseSearchClientPayload,
  stringifySearchClientPayload,
} from '@/features/chat/research/search-result-payload';
import { searchTool } from './search';
import { renderTool } from './render';
import { getServerEnv } from '@/shared/server/env';
import { log } from '@/features/chat/server/agents/services/logger';
import type { ChatTool, ToolHandler } from './types';
import type {
  PendingToolInvocation,
  ToolInvocationResult,
  ChatServerToClientEvent,
} from '@/features/chat/types/chat-api';

export const getAvailableTools = (): ChatTool[] => {
  const env = getServerEnv();
  const tools: ChatTool[] = [];

  tools.push(fetchUrlTool.spec);
  tools.push(renderTool.spec);

  if (env.SERP_API_KEY) {
    tools.push(searchTool.spec);
  } else {
    log('TOOLS', 'Skipping tool: search (missing SERP_API_KEY)');
  }

  return tools;
};

export async function* executeToolsGen(
  toolCalls: PendingToolInvocation[],
  signal?: AbortSignal,
): AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]> {
  const results: ToolInvocationResult[] = [];

  for (const toolcall of toolCalls) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    yield {
      type: 'tool_call',
      tool: toolcall.name,
      args: toolcall.args as Record<string, object | string | number | boolean>,
      callId: toolcall.id,
    };

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
        rawResult = await handleTool(toolcall.args, signal);
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

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
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
      if (toolResult.model.startsWith('Error:')) {
        yield {
          type: 'artifact_failed',
          artifactId: toolcall.id,
          message: toolResult.model,
        };
      } else {
        yield {
          type: 'artifact_completed',
          artifactId: toolcall.id,
        };
      }
    }

    yield {
      type: 'tool_result',
      tool: toolcall.name,
      result: toolResult.client,
      callId: toolcall.id,
    };

    results.push({
      id: toolcall.id,
      name: toolcall.name,
      result: toolResult.model,
    });
  }

  return results;
}
