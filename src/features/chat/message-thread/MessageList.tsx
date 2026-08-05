import { useRef } from 'react';
import type { Message } from './message';
import { MessageItem } from './MessageItem';
import { SelectionToolbar } from './selection-toolbar';

type MessageListProps = {
  messages: Message[];
  currentPath: number[];
  isStreaming: boolean;
};

export function MessageList({ messages, currentPath, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const widthClass = 'w-[90%] @[921px]:w-[60%]';

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className='relative w-full h-full'>
      <div ref={scrollRef} className='w-full h-full overflow-y-auto'>
        <div
          role='log'
          aria-live='polite'
          className={`flex-1 min-h-0 flex flex-col mx-auto px-1 pb-[80vh] font-serif ${widthClass}`}
        >
          {currentPath.map((messageId, index) => {
            const message = messages[messageId - 1];
            if (!message) return null;

            const isLastMessage = index === currentPath.length - 1;
            const depth = index + 1;

            return (
              <MessageItem
                key={messageId}
                message={message}
                index={index}
                depth={depth}
                isStreaming={isLastMessage && isStreaming}
              />
            );
          })}
        </div>
      </div>

      <SelectionToolbar containerRef={scrollRef} />
    </div>
  );
}
