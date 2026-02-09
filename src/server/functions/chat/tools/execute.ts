import { callToolByName } from "@/src/server/functions/chat/tools/registry";
import type { ToolProgressUpdate } from "@/src/server/functions/chat/tools/types";
import { getLogger } from "@/src/server/functions/chat/logger";
import type { PendingToolInvocation, ToolInvocationResult, ChatServerToClientEvent } from "../types";

export type ExecuteToolsOptions = {
  onEvent: (event: ChatServerToClientEvent) => void;
};

export async function executeTools(
  toolCalls: PendingToolInvocation[],
  options: ExecuteToolsOptions
): Promise<ToolInvocationResult[]> {
  const { onEvent } = options;

  return Promise.all(
    toolCalls.map(async (tc) => {
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
      });

      const normalizedResult = typeof result === "string" ? result : JSON.stringify(result);

      onEvent({
        type: "tool_result",
        tool: tc.name,
        result: normalizedResult,
        callId: tc.id,
      });

      return { id: tc.id, name: tc.name, result: normalizedResult };
    })
  );
}

export async function* executeToolsGen(
  toolCalls: PendingToolInvocation[],
): AsyncGenerator<ChatServerToClientEvent, ToolInvocationResult[]> {
  const results: ToolInvocationResult[] = []

  for (const tc of toolCalls) {
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
    })

    for (const event of progressBuffer) {
      yield event
    }

    const normalizedResult = typeof result === "string" ? result : JSON.stringify(result)

    yield {
      type: "tool_result",
      tool: tc.name,
      result: normalizedResult,
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
