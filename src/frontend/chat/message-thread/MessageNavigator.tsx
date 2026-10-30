import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMessage } from '@/frontend/conversations/conversation-tree/message-tree-state';
import { Button } from '@/frontend/design-system/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/design-system/dropdown-menu';
import { ChevronDown } from '@/frontend/design-system/icons';

export const MessageNavigationTargetContext = createContext<HTMLElement | null>(null);

function MessagePreview({ messageId }: { messageId: number }) {
  const message = useMessage(messageId);
  if (!message) return null;
  const text = message.blocks
    .flatMap((block) => {
      if (block.type === 'content') return [block.content];
      if (block.type === 'attachments') return block.attachments.map((file) => file.name);
      if (block.type === 'quotes') return block.quotes.map((quote) => quote.text);
      return [];
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <>
      <span className='block text-xs text-muted-foreground'>
        {message.role === 'user' ? '你' : '助手'}
      </span>
      <span className='mt-1 block line-clamp-3 break-words text-sm'>
        {text.slice(0, 80)}
        {text.length > 80 ? '…' : ''}
      </span>
    </>
  );
}

export function MessageNavigator({
  messageIds,
  scrollElement,
}: {
  messageIds: number[];
  scrollElement: RefObject<HTMLDivElement | null>;
}) {
  const navigationTarget = useContext(MessageNavigationTargetContext);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    const root = scrollElement.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>('[data-message-id]')];
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const readingPosition = root.getBoundingClientRect().top + root.clientHeight / 3;
        let current = items[0];
        for (const item of items) {
          if (item.getBoundingClientRect().top > readingPosition) break;
          current = item;
        }
        setActiveId(current ? Number(current.dataset.messageId) : null);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(root);
    for (const item of items) observer.observe(item);
    root.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('scroll', update);
    };
  }, [messageIds, scrollElement]);

  if (!navigationTarget) return null;

  return createPortal(
    <DropdownMenu positioning={{ placement: 'bottom-start', gutter: 8 }}>
      <DropdownMenuTrigger
        asChild={(triggerProps) => (
          <Button {...triggerProps} variant='ghost' className='h-10'>
            对话导航
            <ChevronDown />
          </Button>
        )}
      />
      <DropdownMenuContent
        keepMounted
        aria-label='消息导航'
        className='max-h-[min(60vh,var(--available-height))] w-80 max-w-[calc(100vw-1rem)] overscroll-contain'
      >
        {messageIds.map((messageId, index) => (
          <DropdownMenuItem
            key={messageId}
            aria-label={`跳转到第 ${index + 1} 条消息`}
            aria-current={activeId === messageId ? 'location' : undefined}
            className='flex-col items-start gap-0 px-3 py-2 aria-[current=location]:bg-hover'
            onSelect={() => {
              const root = scrollElement.current;
              const target = root?.querySelector(`[data-message-id="${messageId}"]`);
              if (!root || !target) return;
              root.scrollTo({
                top:
                  root.scrollTop +
                  target.getBoundingClientRect().top -
                  root.getBoundingClientRect().top -
                  24,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              });
            }}
          >
            <MessagePreview messageId={messageId} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>,
    navigationTarget,
  );
}
