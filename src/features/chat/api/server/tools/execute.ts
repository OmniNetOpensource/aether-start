import { callToolByName } from "@/features/chat/api/server/tools/registry";
import type { ToolProgressUpdate } from "@/features/chat/api/server/tools/types";
import { getLogger } from "@/features/chat/api/server/services/logger";
import type { PendingToolInvocation, ToolInvocationResult, ChatServerToClientEvent } from "../../types/schemas/types";

export type ExecuteToolsOptions = {
  onEvent: (event: ChatServerToClientEvent) => void;
  signal?: AbortSignal;
};

const isFetchResultError = (result: string) => {
  const text = result.trim()
  if (!text) {
    return false
  }

  const isSystemPromptTooLong =
    text.startsWith("[系统提示:") &&
    (text.includes("内容过长") || text.includes("已省略不返回"))

  return text.startsWith("Error") || isSystemPromptTooLong
}

const formatToolResultForClient = (toolName: string, result: string) => {
  if (toolName !== "fetch_url") {
    return result
  }

  return isFetchResultError(result) ? "Error: Fetch failed" : "Success"
}

export async function executeTools(
  toolCalls: PendingToolInvocation[],
  options: ExecuteToolsOptions
): Promise<ToolInvocationResult[]> {
  const { onEvent, signal } = options;

  return Promise.all(
    toolCalls.map(async (tc) => {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      onEvent({ type: "tool_call", tool: tc.name, args: tc.args as Record<string, object | string | number | boolean>, callId: tc.id });

      const result = await callToolByName(tc.name, tc.args, (progress: ToolProgressUpdate) => {
        onEvent({
          type: "tool_progress",
          tool: tc.name,
          stage: progress.stage,
          message: String(progress.message ?? ""),
          receivedBytes: progress.receivedBytes,
          totalBytes: progress.totalBytes,
          callId: tc.id,
        });
      }, signal);

      const normalizedResult = typeof result === "string" ? result : JSON.stringify(result);
      const clientResult = formatToolResultForClient(tc.name, normalizedResult)

      onEvent({
        type: "tool_result",
        tool: tc.name,
        result: clientResult,
        callId: tc.id,
      });

      return { id: tc.id, name: tc.name, result: normalizedResult };
    })
  );
}

export async function* executeToolsGen(
  toolCalls: PendingToolInvocation[],
  signal?: AbortSignal,
): AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]> {
  const results: ToolInvocationResult[] = []

  for (const tc of toolCalls) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    yield { type: "tool_call", tool: tc.name, args: tc.args as Record<string, object | string | number | boolean>, callId: tc.id }

    const progressBuffer: ChatServerToClientEvent[] = []

    const result = await callToolByName(tc.name, tc.args, (progress: ToolProgressUpdate) => {
      progressBuffer.push({
        type: "tool_progress",
        tool: tc.name,
        stage: progress.stage,
        message: String(progress.message ?? ""),
        receivedBytes: progress.receivedBytes,
        totalBytes: progress.totalBytes,
        callId: tc.id,
      })
    }, signal)

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    for (const event of progressBuffer) {
      yield event
    }

    const normalizedResult = typeof result === "string" ? result : JSON.stringify(result)
    const clientResult = formatToolResultForClient(tc.name, normalizedResult)

    yield {
      type: "tool_result",
      tool: tc.name,
      result: clientResult,
      callId: tc.id,
    }

    getLogger().log("TOOL", `Tool result: ${tc.name}`, {
      callId: tc.id,
      resultLength: normalizedResult.length,
    })

    results.push({ id: tc.id, name: tc.name, result: normalizedResult })
  }

  return results
}
