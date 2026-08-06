import { For, onSettled } from 'solid-js';
import { Loader2 } from '@/frontend/design-system/icons';
import {
  useConversationsQuery,
  selectAllConversations,
  upsertConversationInCache,
} from '@/frontend/conversations/session';
import { conversationId } from '@/frontend/conversations/session/conversation-meta';
import { ConversationItem } from './ConversationItem';

type ConversationListProps = {
  onDropdownOpenChange: (open: boolean) => void;
};

export function ConversationList(props: ConversationListProps) {
  const query = useConversationsQuery();
  let historyScroll: HTMLDivElement | undefined;
  let sentinel: HTMLDivElement | undefined;

  onSettled(() => {
    if (!sentinel || !historyScroll) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (query.isFetchingNextPage || !query.hasNextPage) return;
        void query.fetchNextPage().catch((error) => {
          console.error('Failed to fetch more conversations:', error);
        });
      },
      { root: historyScroll, rootMargin: '120px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  onSettled(() => {
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
  });

  const conversations = () => selectAllConversations(query.data);
  return (
    <>
      {query.isLoading && conversations().length === 0 ? (
        <div class='flex items-center justify-center py-6 text-muted-foreground'>
          <Loader2 class='h-4 w-4 animate-spin' />
          <span class='ml-2 text-xs'>加载会话中…</span>
        </div>
      ) : (
        <div
          ref={(element) => {
            historyScroll = element;
          }}
          class='flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pr-1'
        >
          <div class='flex flex-col gap-1'>
            <For each={conversations()}>
              {(conversation) => (
                <ConversationItem
                  conversation={conversation}
                  isActive={conversation.id === conversationId()}
                  onDropdownOpenChange={props.onDropdownOpenChange}
                />
              )}
            </For>
            {query.hasNextPage || query.isFetchingNextPage ? (
              <div
                ref={(element) => {
                  sentinel = element;
                }}
                class='flex items-center justify-center py-3 text-muted-foreground'
              >
                {query.isFetchingNextPage ? (
                  <>
                    <Loader2 class='h-4 w-4 animate-spin' />
                    <span class='ml-2 text-xs'>加载更多...</span>
                  </>
                ) : (
                  <span class='text-xs'>滚动加载更多...</span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
