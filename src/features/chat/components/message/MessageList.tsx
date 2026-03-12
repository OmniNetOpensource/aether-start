
import { useRef } from "react";
import { MessageItem } from "./MessageItem";
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { SelectionToolbar } from "./SelectionToolbar";
import { ConnectionStatusInline } from "./ConnectionStatusInline";

type MessageListProps = {
  className?: string;
  listClassName?: string;
};

export function MessageList({
  className,
  listClassName,
}: MessageListProps = {}) {
  const currentPath = useMessageTreeStore((state) => state.currentPath);
  const requestPhase = useChatRequestStore((s) => s.requestPhase);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className={`relative w-full h-full ${className ?? ""}`.trim()}>
      <div
        ref={scrollRef}
        className="w-full h-full overflow-y-auto"
      >
        <div
          role="log"
          aria-live="polite"
          className={`flex-1 min-h-0 flex flex-col mx-auto w-[90%] md:w-[70%] lg:w-[50%] px-1 pb-40 md:pb-44 lg:pb-48 ${listClassName ?? ""}`.trim()}
        >
          {currentPath.map((messageId, index) => {
            const isLastMessage = index === currentPath.length - 1;
            const isStreaming = isLastMessage && requestPhase === "answering";
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
