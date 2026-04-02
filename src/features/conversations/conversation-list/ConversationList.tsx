import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useChatSessionStore } from '@/features/conversations/session';
import {
  useConversationsQuery,
  selectAllConversations,
  upsertConversationInCache,
} from '@/features/conversations/session';
import { ConversationItem } from './ConversationItem';

type ConversationListProps = {
  onDropdownOpenChange: (open: boolean) => void;
};

export function ConversationList({ onDropdownOpenChange }: ConversationListProps) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useConversationsQuery();
  const activeConversationId = useChatSessionStore((state) => state.conversationId);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage) return;

    const target = sentinelRef.current;
    const root = historyScrollRef.current;
    if (!target || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (isFetchingNextPage || !hasNextPage) return;
        void fetchNextPage();
      },
      { root, rootMargin: '120px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

  useEffect(() => {
    const ch = new BroadcastChannel('conversation_title');
    ch.onmessage = (event: MessageEvent<{ id: string; title: string; updated_at: string }>) => {
      upsertConversationInCache({
        id: event.data.id,
        title: event.data.title,
        is_pinned: false,
        pinned_at: null,
        created_at: event.data.updated_at,
        updated_at: event.data.updated_at,
      });
    };
    return () => ch.close();
  }, []);

  const conversations = selectAllConversations(data);

  if (isLoading && conversations.length === 0) {
    return (
      <div className='flex items-center justify-center py-6 text-(--text-tertiary)'>
        <Loader2 className='h-4 w-4 animate-spin' />
        <span className='ml-2 text-xs'>加载会话中…</span>
      </div>
    );
  }

  return (
    <div
      ref={historyScrollRef}
      className='flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1'
    >
      <div className='flex flex-col gap-1'>
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
            onDropdownOpenChange={onDropdownOpenChange}
          />
        ))}
        {hasNextPage || isFetchingNextPage ? (
          <div
            ref={sentinelRef}
            className='flex items-center justify-center py-3 text-(--text-tertiary)'
          >
            {isFetchingNextPage ? (
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
