import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppShellRouteData } from '@/features/sidebar/app-shell-route-data';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { ConversationItem } from './ConversationItem';

type ConversationListProps = {
  onDropdownOpenChange: (open: boolean) => void;
};

export function ConversationList({ onDropdownOpenChange }: ConversationListProps) {
  const appShellData = useAppShellRouteData();
  const conversations = useChatSessionStore((state) => state.conversations);
  const conversationsLoading = useChatSessionStore((state) => state.conversationsLoading);
  const loadMoreConversations = useChatSessionStore((state) => state.loadMoreConversations);
  const hasLoaded = useChatSessionStore((state) => state.hasLoaded);
  const loadingMore = useChatSessionStore((state) => state.loadingMore);
  const hasMore = useChatSessionStore((state) => state.hasMore);
  const activeConversationId = useChatSessionStore((state) => state.conversationId);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const initialConversations = appShellData?.initialConversations ?? [];
  const initialHasMore = (appShellData?.nextConversationCursor ?? null) !== null;

  useEffect(() => {
    const visibleHasMore = hasLoaded ? hasMore : initialHasMore;
    if (!visibleHasMore) {
      return;
    }

    const target = sentinelRef.current;
    const root = historyScrollRef.current;
    if (!target || !root) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        if (loadingMore || !visibleHasMore) {
          return;
        }
        void loadMoreConversations();
      },
      {
        root,
        rootMargin: '120px',
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasLoaded, hasMore, initialHasMore, loadMoreConversations, loadingMore]);

  const visibleConversations = hasLoaded ? conversations : initialConversations;
  const visibleHasMore = hasLoaded ? hasMore : initialHasMore;

  if (conversationsLoading && !hasLoaded && visibleConversations.length === 0) {
    return (
      <div className='flex items-center justify-center py-6 text-(--text-tertiary)'>
        <Loader2 className='h-4 w-4 animate-spin' />
        <span className='ml-2 text-xs'>加载会话中...</span>
      </div>
    );
  }

  const orderedConversations = visibleConversations.slice().sort((a, b) => {
    if (a.is_pinned === b.is_pinned) return 0;
    return a.is_pinned ? -1 : 1;
  });

  return (
    <div
      ref={historyScrollRef}
      className='flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1'
    >
      <div className='flex flex-col gap-1'>
        {orderedConversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            onDropdownOpenChange={onDropdownOpenChange}
          />
        ))}
        {visibleHasMore || loadingMore ? (
          <div
            ref={sentinelRef}
            className='flex items-center justify-center py-3 text-(--text-tertiary)'
          >
            {loadingMore ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span className='ml-2 text-xs'>加载更多...</span>
              </>
            ) : (
              <span className='text-xs'>滚动加载更多...</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
