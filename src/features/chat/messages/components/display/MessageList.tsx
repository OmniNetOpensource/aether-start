
import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { insertQuoteAtCursor } from "@/features/chat/composer/lib/composer-focus";
import { useTextSelection } from "@/features/chat/messages/hooks/useTextSelection";
import { SelectionQuoteButton } from "./SelectionQuoteButton";

export function MessageList() {
  const currentPath = useMessageTreeStore((state) => state.currentPath);
  const pending = useChatRequestStore((state) => state.pending);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { selection, updateSelection, clearSelection } =
    useTextSelection(scrollRef);
  const clearSelectionRef = useRef(clearSelection);

  const handleQuote = () => {
    if (selection.text) {
      insertQuoteAtCursor(selection.text);
      clearSelection();
    }
  };

  useEffect(() => {
    clearSelectionRef.current = clearSelection;
  }, [clearSelection]);

  useEffect(() => {
    clearSelectionRef.current();
  }, [currentPath.length]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        className="h-full w-full overflow-y-auto"
        onMouseUp={updateSelection}
        onTouchEnd={updateSelection}
      >
        <div
          role="log"
          aria-live="polite"
          className="flex-1 min-h-0 flex flex-col mx-auto w-[90%] md:w-[70%] lg:w-[50%] px-1 pb-40 md:pb-44 lg:pb-48"
        >
          {currentPath.map((messageId, index) => {
            const isLastMessage = index === currentPath.length - 1;
            const isStreaming = isLastMessage && pending;
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

      {selection.text && (
        <SelectionQuoteButton
          text={selection.text}
          rect={selection.rect}
          onQuote={handleQuote}
        />
      )}
    </div>
  );
}
