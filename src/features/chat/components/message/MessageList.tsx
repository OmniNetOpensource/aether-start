
import { useRef } from "react";
import { MessageItem } from "./MessageItem";
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'
import {
  isChatRequestAnswering,
  selectChatRequestStatus,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";
import { SelectionToolbar } from "./SelectionToolbar";
import { ConnectionStatusInline } from "./ConnectionStatusInline";

export function MessageList() {
  const currentPath = useMessageTreeStore((state) => state.currentPath);
  const status = useChatRequestStore(selectChatRequestStatus);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        className="h-full w-full overflow-y-auto"
      >
        <div
          role="log"
          aria-live="polite"
          className="flex-1 min-h-0 flex flex-col mx-auto w-[90%] md:w-[70%] lg:w-[50%] px-1 pb-40 md:pb-44 lg:pb-48"
        >
          {currentPath.map((messageId, index) => {
            const isLastMessage = index === currentPath.length - 1;
            const isStreaming = isLastMessage && isChatRequestAnswering(status);
            const depth = index + 1;

            return (
              <MessageItem
                key={messageId}
                messageId={messageId}
                index={index}
                depth={depth}
                isStreaming={isStreaming}
              />
            );
          })}
          <ConnectionStatusInline />

        </div>
      </div>

      <SelectionToolbar containerRef={scrollRef} />
    </div>
  );
}
