import { callToolByName } from "@/src/shared/lib/tools";
import type { ToolProgressUpdate } from "@/src/shared/lib/tools/types";
import type { ConversationLogger } from "@/src/shared/lib/conversation-logger";
import type { PendingToolCall, ToolCallResult, StreamEvent } from "./types";

export type ExecuteToolsOptions = {
  logger: ConversationLogger | null;
  onEvent: (event: StreamEvent) => void;
};

export async function executeTools(
  toolCalls: PendingToolCall[],
  options: ExecuteToolsOptions
): Promise<ToolCallResult[]> {
  const { onEvent } = options;

  return Promise.all(
    toolCalls.map(async (tc) => {
      onEvent({ type: "tool_call", tool: tc.name, args: tc.args, callId: tc.id });

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

      onEvent({ type: "tool_result", tool: tc.name, result, callId: tc.id });

      return { id: tc.id, name: tc.name, result: normalizedResult };
    })
  );
}
