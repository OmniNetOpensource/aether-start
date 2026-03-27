import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { ChevronUp, ChevronDown, ArrowDown } from 'lucide-react';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { useResponsive } from '@/shared/providers/ResponsiveContext';
import { Button } from '@/shared/ui/button';
import { useMountEffect } from '@/shared/useMountEffect';
import { MessageItem } from './MessageItem';
import { OutlineButton } from './outline';
import { SelectionToolbar } from './selection-toolbar';

const LEAVE_TOLERANCE_PX = 1;

function findCurrentMessageIndex(container: HTMLElement): number {
  const messages = container.querySelectorAll('[data-message-id]');
  if (messages.length === 0) return -1;

  const containerRect = container.getBoundingClientRect();
  const containerTop = containerRect.top;

  let closestIndex = -1;
  let closestDist = Infinity;

  messages.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top - containerTop);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  });

  return closestIndex;
}

type MessageListProps = {
  className?: string;
  listClassName?: string;
};

type ChatActionsRailProps = {
  currentPath: number[];
  isMobile: boolean;
  isStreaming: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
};

function ChatActionsRail({ currentPath, isMobile, isStreaming, scrollRef }: ChatActionsRailProps) {
  const rafIdRef = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);

  const canPrev = currentPath.length > 1 && currentIdx > 0;
  const canNext = currentPath.length > 1 && currentIdx >= 0 && currentIdx < currentPath.length - 1;

  const closeRail = () => setExpanded(false);
  const openRail = () => setExpanded(true);

  const followBottom = () => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: isStreaming ? 'auto' : 'smooth',
    });

    if (isStreaming) {
      rafIdRef.current = requestAnimationFrame(followBottom);
    }
  };

  const handleTriggerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openRail();
  };

  const handleMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    if (isMobile) return;

    const { left } = event.currentTarget.getBoundingClientRect();
    if (event.clientX <= left + LEAVE_TOLERANCE_PX) {
      closeRail();
    }
  };

  const scrollToMessage = (messageId: number) => {
    const container = scrollRef.current;
    if (!container) return;

    const message = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    message?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrev = () => {
    const container = scrollRef.current;
    if (!container || !canPrev) return;

    const idx = findCurrentMessageIndex(container);
    if (idx <= 0) return;

    scrollToMessage(currentPath[idx - 1]);
  };

  const handleNext = () => {
    const container = scrollRef.current;
    if (!container || !canNext) return;

    const idx = findCurrentMessageIndex(container);
    if (idx < 0 || idx >= currentPath.length - 1) return;

    scrollToMessage(currentPath[idx + 1]);
  };

  useMountEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const cancelPendingScroll = () => {
      if (rafIdRef.current === null) return;

      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    };

    let prevScrollTop = container.scrollTop;
    const handleScroll = () => {
      const top = container.scrollTop;
      if (top < prevScrollTop) {
        cancelPendingScroll();
      }
      prevScrollTop = top;
    };

    container.addEventListener('scroll', handleScroll);
    container.addEventListener('click', cancelPendingScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('click', cancelPendingScroll);
    };
  });

  useMountEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateCurrentIdx = () => {
      setCurrentIdx(findCurrentMessageIndex(container));
    };

    updateCurrentIdx();
    container.addEventListener('scroll', updateCurrentIdx);

    const resizeObserver = new ResizeObserver(updateCurrentIdx);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateCurrentIdx);
      resizeObserver.disconnect();
    };
  });

  useEffect(() => {
    if (!expanded) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest('[data-chat-actions-rail]')) return;
      if (target.closest('[data-outline-dialog]')) return;

      closeRail();
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [expanded]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && expanded) {
        closeRail();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [expanded]);

  return (
    <>
      <div
        className='absolute right-0 top-1/2 z-(--z-sidebar) h-24 w-2 -translate-y-1/2 rounded-l-md bg-border transition-all duration-300 group-hover/rail-trigger:w-2.5'
        onClick={isMobile ? handleTriggerClick : undefined}
        onMouseEnter={isMobile ? undefined : openRail}
        aria-label='展开聊天操作'
      />
      {expanded && (
        <div
          className='absolute right-4 top-0 z-(--z-sidebar) flex h-full flex-col justify-center gap-1 bg-transparent p-1 transition-transform duration-300 ease-(--transition-smooth) pointer-events-auto'
          onMouseLeave={isMobile ? undefined : handleMouseLeave}
          data-chat-actions-rail
        >
          <OutlineButton />
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            onClick={handlePrev}
            aria-label='Previous message'
            title='Previous message'
          >
            <ChevronUp className='h-4 w-4' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            onClick={handleNext}
            aria-label='Next message'
            title='Next message'
          >
            <ChevronDown className='h-4 w-4' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            onClick={followBottom}
            aria-label='Scroll to bottom'
            title='Scroll to bottom'
          >
            <ArrowDown className='h-4 w-4' />
          </Button>
        </div>
      )}
    </>
  );
}

export function MessageList({ className, listClassName }: MessageListProps = {}) {
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const isStreaming = useChatRequestStore((state) => state.status === 'streaming');
  const deviceType = useResponsive();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const widthClass = 'w-[90%] @[921px]:w-[60%]';

  return (
    <div className={`relative w-full h-full ${className ?? ''}`.trim()}>
      <div ref={scrollRef} className='w-full h-full overflow-y-auto'>
        <div
          role='log'
          aria-live='polite'
          className={`flex-1 min-h-0 flex flex-col mx-auto px-1 pb-44 ${widthClass} ${listClassName ?? ''}`.trim()}
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
      <ChatActionsRail
        currentPath={currentPath}
        isMobile={deviceType === 'mobile'}
        isStreaming={isStreaming}
        scrollRef={scrollRef}
      />
    </div>
  );
}
