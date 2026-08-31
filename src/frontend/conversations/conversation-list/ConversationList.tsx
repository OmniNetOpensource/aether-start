import { useEffect, useRef } from 'react';
import { Loader2 } from '@/frontend/design-system/icons';
import {
  useConversationsQuery,
  selectAllConversations,
  updateConversationTitleInCache,
} from '@/frontend/conversations/session';
import { useConversationId } from '@/frontend/conversations/session/conversation-meta';
import { ConversationItem } from './ConversationItem';

type ConversationListProps = {
  onDropdownOpenChange: (open: boolean) => void;
};

export function ConversationList(props: ConversationListProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useConversationsQuery();
  const activeConversationId = useConversationId();
  const historyScroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinel.current || !historyScroll.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (isFetchingNextPage || !hasNextPage) return;
        void fetchNextPage().catch((error) => {
          console.error('Failed to fetch more conversations:', error);
        });
      },
      { root: historyScroll.current, rootMargin: '120px' },
    );

    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const ch = new BroadcastChannel('conversation_title');
    ch.onmessage = (event: MessageEvent<{ id: string; title: string; updated_at: string }>) => {
      updateConversationTitleInCache(event.data.id, event.data.title, event.data.updated_at);
    };
    return () => ch.close();
  }, []);

  const conversations = selectAllConversations(data);
  return (
    <>
      {isLoading && conversations.length === 0 ? (
        <div className='flex items-center justify-center py-6 text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' />
          <span className='ml-2 text-xs'>加载会话中…</span>
        </div>
      ) : (
        <div
          ref={historyScroll}
          className='flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1'
        >
          <div className='flex flex-col gap-1'>
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onDropdownOpenChange={props.onDropdownOpenChange}
              />
            ))}
            {hasNextPage || isFetchingNextPage ? (
              <div
                ref={sentinel}
                className='flex items-center justify-center py-3 text-muted-foreground'
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
      )}
    </>
  );
}
