
import { useRef } from "react";
import { MessageItem } from "./MessageItem";
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'
import type { Message } from "@/types/message";
import {
  isChatRequestAnswering,
  selectChatRequestStatus,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";
import { SelectionToolbar } from "./SelectionToolbar";
import { ConnectionStatusInline } from "./ConnectionStatusInline";

type MessageListProps = {
  messages?: Message[];
  readonly?: boolean;
  className?: string;
  listClassName?: string;
  showConnectionStatus?: boolean;
  showSelectionToolbar?: boolean;
  usePageScroll?: boolean;
};

export function MessageList({
  messages,
  readonly = false,
  className,
  listClassName,
  showConnectionStatus = !readonly,
  showSelectionToolbar = !readonly,
  usePageScroll = false,
}: MessageListProps = {}) {
  const currentPath = useMessageTreeStore((state) => state.currentPath);
  const status = useChatRequestStore(selectChatRequestStatus);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderedMessages =
    messages ??
    currentPath
      .map((messageId) => useMessageTreeStore.getState().messages[messageId - 1])
      .filter((message): message is Message => Boolean(message));

  return (
    <div className={`relative w-full ${usePageScroll ? "" : "h-full"} ${className ?? ""}`.trim()}>
      <div
        ref={scrollRef}
        className={`w-full ${usePageScroll ? "" : "h-full overflow-y-auto"}`.trim()}
      >
        <div
          role="log"
          aria-live="polite"
          className={`flex-1 min-h-0 flex flex-col mx-auto w-[90%] md:w-[70%] lg:w-[50%] px-1 pb-40 md:pb-44 lg:pb-48 ${listClassName ?? ""}`.trim()}
        >
          {renderedMessages.map((message, index) => {
            const isLastMessage = index === renderedMessages.length - 1;
            const isStreaming = !readonly && isLastMessage && isChatRequestAnswering(status);
            const depth = index + 1;

            return (
              <MessageItem
                key={message.id}
                messageId={message.id}
                index={index}
                depth={depth}
                isStreaming={isStreaming}
                message={message}
                readonly={readonly}
              />
            );
          })}
          {showConnectionStatus && <ConnectionStatusInline />}

        </div>
      </div>

      {showSelectionToolbar && <SelectionToolbar containerRef={scrollRef} />}
    </div>
  );
}
