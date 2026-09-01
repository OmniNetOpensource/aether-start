import { isAbortError } from '@/backend/chat/abort';
import { askUserQuestionsTool } from '@/backend/chat/tools/ask-user-questions';
import { fetchUrlTool } from '@/backend/chat/tools/fetch-tool';
import {
  buildFetchClientPayload,
  stringifyFetchClientPayload,
} from '@/shared/chat/research/fetch-result-payload';
import {
  parseSearchClientPayload,
  stringifySearchClientPayload,
} from '@/shared/chat/research/search-result-payload';
import { searchTool } from '@/backend/chat/tools/search-tool';
import { renderTool } from '@/backend/chat/tools/render-tool';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import { log } from '@/backend/chat/logger';
import type { ChatTool, ToolHandler } from '@/shared/chat/tool-types';
import type {
  PendingToolInvocation,
  ToolInvocationResult,
  ChatServerToClientEvent,
} from '@/shared/chat/chat-api';

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
      rawResult = await handleTool(toolcall.args, signal);
    } catch (error) {
      if (isAbortError(error, signal)) {
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
      clientResult = stringifyFetchClientPayload(buildFetchClientPayload(toolcall.args, rawResult));
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
