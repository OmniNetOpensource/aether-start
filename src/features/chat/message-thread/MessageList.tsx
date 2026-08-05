import { useRef } from 'react';
import { useChatRequestStore } from '@/features/chat/composer/composer-request/useChatRequestStore';
import { useChatSessionStore } from '@/features/conversations/session';
import { MessageItem } from './MessageItem';
import { SelectionToolbar } from './selection-toolbar';

export function MessageList() {
  const messages = useChatSessionStore((state) => state.messages);
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const isStreaming = useChatRequestStore((state) => state.status === 'streaming');
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
            const isLastMessage = index === currentPath.length - 1;
            const depth = index + 1;

            return (
              <MessageItem
                key={messageId}
                messageId={messageId}
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
