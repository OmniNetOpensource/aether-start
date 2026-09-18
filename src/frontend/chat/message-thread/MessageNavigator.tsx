import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMessage } from '@/frontend/conversations/conversation-tree/message-tree-state';

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
  const navigation = useRef<HTMLElement>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ messageId: number; top: number } | null>(null);

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

  return (
    <nav
      ref={navigation}
      aria-label='消息导航'
      className='absolute right-3 top-[20%] bottom-[20%] z-20 hidden flex-col justify-center @[640px]:flex'
      onKeyDown={(event) => {
        if (event.key === 'Escape') setPreview(null);
      }}
    >
      <div
        className='max-h-full overflow-y-auto overscroll-contain [scrollbar-width:none]'
        onScroll={() => setPreview(null)}
      >
        {messageIds.map((messageId, index) => (
          <button
            key={messageId}
            type='button'
            aria-label={`跳转到第 ${index + 1} 条消息`}
            aria-current={activeId === messageId ? 'location' : undefined}
            aria-describedby={
              preview?.messageId === messageId ? 'message-navigation-preview' : undefined
            }
            className='group flex h-6 w-10 cursor-pointer items-center justify-end rounded px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring'
            onMouseEnter={(event) => {
              const root = navigation.current;
              if (!root) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setPreview({
                messageId,
                top: rect.top + rect.height / 2 - root.getBoundingClientRect().top,
              });
            }}
            onMouseLeave={() => setPreview(null)}
            onFocus={(event) => {
              const root = navigation.current;
              if (!root) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setPreview({
                messageId,
                top: rect.top + rect.height / 2 - root.getBoundingClientRect().top,
              });
            }}
            onBlur={() => setPreview(null)}
            onClick={() => {
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
            <MessageLine messageId={messageId} active={activeId === messageId} />
          </button>
        ))}
      </div>
      {preview && messageIds.includes(preview.messageId) && (
        <div
          id='message-navigation-preview'
          role='tooltip'
          className='pointer-events-none absolute right-full mr-3 w-64 -translate-y-1/2 rounded-lg border border-border bg-surface p-3 text-foreground shadow-md'
          style={{ top: preview.top }}
        >
          <MessagePreview messageId={preview.messageId} />
        </div>
      )}
    </nav>
  );
}

function MessageLine({ messageId, active }: { messageId: number; active: boolean }) {
  const message = useMessage(messageId);
  return (
    <span
      className={`h-0.5 w-4 rounded-full transition-[width,background-color] duration-150 group-hover:w-7 group-focus-visible:w-7 motion-reduce:transition-none ${
        active
          ? 'bg-foreground'
          : message?.role === 'user'
            ? 'bg-foreground/45'
            : 'bg-foreground/25'
      }`}
    />
  );
}
