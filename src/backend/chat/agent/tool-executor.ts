import { isAbortError } from '@/backend/chat/abort';
import { getToolRegistry } from '@/backend/chat/tools/tool-registry';
import {
  buildReadClientPayload,
  stringifyFetchClientPayload,
} from '@/shared/chat/research/fetch-result-payload';
import {
  parseSearchClientPayload,
  stringifySearchClientPayload,
} from '@/shared/chat/research/search-result-payload';
import { log } from '@/backend/chat/logger';
import type {
  PendingToolInvocation,
  ToolInvocationResult,
  ChatServerToClientEvent,
} from '@/shared/chat/chat-api';

export const getAvailableTools = () => getToolRegistry().map((tool) => tool.spec);

export type ExecutedToolCallResult = {
  events: ChatServerToClientEvent[];
  result: ToolInvocationResult;
};

export const executeToolCall = async (
  toolcall: PendingToolInvocation,
  context: { db: D1Database; userId: string; conversationId: string },
  signal?: AbortSignal,
): Promise<ExecutedToolCallResult> => {
  const events: ChatServerToClientEvent[] = [];

  const handleTool = getToolRegistry().find(
    (tool) => tool.spec.function.name === toolcall.name,
  )?.handler;
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
    if (['fetch_url', 'read_image', 'read_youtube_transcript'].includes(toolcall.name)) {
      clientResult = stringifyFetchClientPayload(
        buildReadClientPayload(toolcall.name, toolcall.args, rawResult),
      );
    }
    toolResult = { client: clientResult, model: rawResult };
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
