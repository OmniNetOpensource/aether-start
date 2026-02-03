import type { StreamEvent } from "./types";
import type { ConversationLogger } from "@/src/shared/lib/conversation-logger";

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
              resultText = `${resultText.slice(0, 500)}…`;
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
