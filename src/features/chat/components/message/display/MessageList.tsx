"use client";

import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";
import { PendingIndicator } from "./PendingIndicator";
import { useMessageTreeStore } from "@/features/chat/store/useMessageTreeStore";
import { useChatRequestStore } from "@/features/chat/store/useChatRequestStore";
import { useComposerStore } from "@/features/chat/store/useComposerStore";
import { computeMessagesFromPath } from "@/features/chat/lib/tree/message-tree";
import { useTextSelection } from "@/features/chat/hooks/useTextSelection";
import { SelectionQuoteButton } from "./SelectionQuoteButton";

export function MessageList() {
  const allMessages = useMessageTreeStore((state) => state.messages);
  const currentPath = useMessageTreeStore((state) => state.currentPath);
  const messages = computeMessagesFromPath(allMessages, currentPath);
  const pending = useChatRequestStore((state) => state.pending);
  const getBranchInfo = useMessageTreeStore((state) => state.getBranchInfo);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { selection, updateSelection, clearSelection } =
    useTextSelection(scrollRef);
  const clearSelectionRef = useRef(clearSelection);

  const handleQuote = () => {
    if (selection.text) {
      useComposerStore.getState().addQuotedText(selection.text);
      useComposerStore.getState().focusTextarea();
      clearSelection();
    }
  };

  useEffect(() => {
    clearSelectionRef.current = clearSelection;
  }, [clearSelection]);

  useEffect(() => {
    clearSelectionRef.current();
  }, [messages.length]);

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
          {messages.map((message, index) => {
            const isLastMessage = index === messages.length - 1;
            const isStreaming = isLastMessage && pending;
            const messageId = message.id;
            const depth = index + 1;
            const branchInfo = getBranchInfo(messageId);

            return (
              <MessageItem
                key={messageId}
                message={message}
                messageId={messageId}
                index={index}
                depth={depth}
                isStreaming={isStreaming}
                branchInfo={branchInfo}
              />
            );
          })}

          {pending && <PendingIndicator />}
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
