import type { StreamEvent } from "./types";
import type { ConversationLogger } from "@/src/providers/logger";
import type { ResearchItem, ToolProgress } from "@/src/features/chat/types/chat";

const encoder = new TextEncoder();

export type EventSender = {
  send: (event: StreamEvent) => void;
  close: () => void;
  isClosed: () => boolean;
};

export function createEventSender(
  controller: ReadableStreamDefaultController<Uint8Array>,
  logger: ConversationLogger | null
): EventSender {
  let closed = false;

  const send = (event: StreamEvent) => {
    if (closed) return;

    const line = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(encoder.encode(line));

    // Create log event data, removing result field for tool_result events
    const logEventData =
      event.type === "tool_result"
        ? (() => {
            const { result, ...rest } = event;
            let resultText = "";
            let resultTruncated = false;
            try {
              resultText =
                typeof result === "string" ? result : JSON.stringify(result);
            } catch {
              resultText = "[Unserializable tool_result]";
            }

            if (resultText.length > 500) {
              resultText = `${resultText.slice(0, 500)}...`;
              resultTruncated = true;
            }

            return {
              ...rest,
              result: resultText,
              resultTruncated,
            };
          })()
        : event;
    logger?.log("FRONTEND", `Sent SSE event: ${event.type}`, logEventData);
  };

  const close = () => {
    if (!closed) {
      controller.close();
      closed = true;
    }
  };

  return {
    send,
    close,
    isClosed: () => closed,
  };
}

export class ResearchTracker {
  private items: ResearchItem[] = [];

  getItems(): ResearchItem[] {
    return this.items;
  }

  handle(event: StreamEvent): void {
    if (event.type === "thinking") {
      this.appendThinking(event.content);
    } else if (event.type === "tool_call") {
      this.ensureToolItem(event.tool, event.args);
    } else if (event.type === "tool_progress") {
      this.appendToolProgress(event.tool, {
        stage: event.stage,
        message: event.message,
        receivedBytes: event.receivedBytes,
        totalBytes: event.totalBytes,
      });
    } else if (event.type === "tool_result") {
      const result = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
      this.appendToolResult(event.tool, result);
    }
  }

  appendThinking(chunk: string): void {
    if (!chunk) return;
    const last = this.items[this.items.length - 1];
    if (last?.kind === "thinking") {
      this.items[this.items.length - 1] = {
        ...last,
        text: `${last.text}${chunk}`,
      };
    } else {
      this.items.push({ kind: "thinking", text: chunk });
    }
  }

  private findToolIndex(toolName: string): number {
    let fallback = -1;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.kind === "tool" && item.data.call.tool === toolName) {
        if (!item.data.result) {
          return i;
        }
        if (fallback === -1) {
          fallback = i;
        }
      }
    }
    return fallback;
  }

  ensureToolItem(toolName: string, args: Record<string, unknown>): number {
    const idx = this.findToolIndex(toolName);
    if (idx === -1) {
      this.items.push({
        kind: "tool",
        data: {
          call: { tool: toolName, args },
          progress: [],
        },
      });
      return this.items.length - 1;
    }
    return idx;
  }

  appendToolProgress(toolName: string, progress: ToolProgress): void {
    const idx = this.ensureToolItem(toolName, {});
    const item = this.items[idx];
    if (item.kind === "tool") {
      const existing = item.data.progress ?? [];
      this.items[idx] = {
        ...item,
        data: { ...item.data, progress: [...existing, progress] },
      };
    }
  }

  appendToolResult(toolName: string, result: string): void {
    const idx = this.ensureToolItem(toolName, {});
    const item = this.items[idx];
    if (item.kind === "tool") {
      this.items[idx] = {
        ...item,
        data: { ...item.data, result: { result } },
      };
    }
  }
}
