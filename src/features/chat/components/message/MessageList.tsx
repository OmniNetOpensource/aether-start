import { useRef } from "react";
import { MessageItem } from "./MessageItem";
import { useChatSessionStore } from '@/stores/zustand/useChatSessionStore'
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useChatRoomNarrow } from "@/features/chat/contexts/ChatRoomNarrowContext";
import { SelectionToolbar } from "./SelectionToolbar";

type MessageListProps = {
  className?: string;
  listClassName?: string;
};

export function MessageList({
  className,
  listClassName,
}: MessageListProps = {}) {
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const status = useChatRequestStore((s) => s.status);
  const narrow = useChatRoomNarrow();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const widthClass = narrow ? "w-[90%]" : "w-[70%]";

  return (
    <div className={`relative w-full h-full ${className ?? ""}`.trim()}>
      <div
        ref={scrollRef}
        className="w-full h-full overflow-y-auto"
      >
        <div
          role="log"
          aria-live="polite"
          className={`flex-1 min-h-0 flex flex-col mx-auto px-1 pb-44 ${widthClass} ${listClassName ?? ""}`.trim()}
        >
          {currentPath.map((messageId, index) => {
            const isLastMessage = index === currentPath.length - 1;
            const isStreaming = isLastMessage && status === "streaming";
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
        </div>
      </div>

      <SelectionToolbar containerRef={scrollRef} />
    </div>
  );
}
