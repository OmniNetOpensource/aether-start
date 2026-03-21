import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { ConversationItem } from './ConversationItem';

type ConversationListProps = {
  onDropdownOpenChange: (open: boolean) => void;
};

export function ConversationList({ onDropdownOpenChange }: ConversationListProps) {
  const conversations = useChatSessionStore((state) => state.conversations);
  const conversationsLoading = useChatSessionStore((state) => state.conversationsLoading);
  const loadInitialConversations = useChatSessionStore((state) => state.loadInitialConversations);
  const loadMoreConversations = useChatSessionStore((state) => state.loadMoreConversations);
  const hasLoaded = useChatSessionStore((state) => state.hasLoaded);
  const loadingMore = useChatSessionStore((state) => state.loadingMore);
  const hasMore = useChatSessionStore((state) => state.hasMore);
  const activeConversationId = useChatSessionStore((state) => state.conversationId);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadInitialConversations();
  }, [loadInitialConversations]);

  useEffect(() => {
    if (!hasMore) {
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
        if (loadingMore || !hasMore) {
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
  }, [hasMore, loadingMore, loadMoreConversations]);

  if (conversationsLoading && !hasLoaded) {
    return (
      <div className='flex items-center justify-center py-6 text-(--text-tertiary)'>
        <Loader2 className='h-4 w-4 animate-spin' />
        <span className='ml-2 text-xs'>加载会话中...</span>
      </div>
    );
  }

  const pinnedConversations = conversations.filter((item) => item.is_pinned);
  const historyConversations = conversations.filter((item) => !item.is_pinned);
  const showHistorySection =
    historyConversations.length > 0 || pinnedConversations.length === 0 || hasMore || loadingMore;

  return (
    <div className='flex h-full min-h-0 flex-col gap-2'>
      {pinnedConversations.length > 0 ? (
        <>
          <div className='px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-(--text-tertiary) font-mono opacity-80'>
            Pinned
          </div>
          <div className='flex flex-col gap-1'>
            {pinnedConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onDropdownOpenChange={onDropdownOpenChange}
              />
            ))}
          </div>
        </>
      ) : null}
      {showHistorySection ? (
        <div className='flex min-h-0 flex-1 flex-col gap-2'>
          <div className='px-1 py-1 text-[10px] font-semibold uppercase tracking-widest text-(--text-tertiary) font-mono opacity-80'>
            History
          </div>
          <div
            ref={historyScrollRef}
            className='min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1'
          >
            <div className='flex flex-col gap-1'>
              {historyConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === activeConversationId}
                  onDropdownOpenChange={onDropdownOpenChange}
                />
              ))}
              {hasMore || loadingMore ? (
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
        </div>
      ) : null}
    </div>
  );
}
