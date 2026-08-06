import { createEffect, createSignal, For } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { Loader2, Search } from '@/shared/design-system/icons';
import type { ConversationSearchItem } from '@/features/conversations/session';
import {
  searchConversationsFn,
  type ConversationSearchCursor,
} from '@/features/conversations/session';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/design-system/dialog';
import { truncateMiddle } from '@/shared/core/truncate-middle';

const PAGE_SIZE = 20;

const searchCache = new Map<
  string,
  { items: ConversationSearchItem[]; nextCursor: ConversationSearchCursor }
>();

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export type ConversationSearchDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
};

function ConversationSearchContent(props: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal('');
  const [debouncedQuery, setDebouncedQuery] = createSignal('');
  const [items, setItems] = createSignal<ConversationSearchItem[]>([]);
  const [cursor, setCursor] = createSignal<ConversationSearchCursor>(null);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [hasSearched, setHasSearched] = createSignal(false);
  let requestId = 0;

  createEffect(
    () => query(),
    (query) => {
      const timer = window.setTimeout(() => {
        setDebouncedQuery(query.trim());
      }, 250);
      return () => window.clearTimeout(timer);
    },
  );

  createEffect(
    () => debouncedQuery(),
    (debouncedQuery) => {
      if (!debouncedQuery) {
        setItems([]);
        setCursor(null);
        setLoading(false);
        setLoadingMore(false);
        setHasSearched(false);
        return;
      }

      const cached = searchCache.get(debouncedQuery);
      if (cached) {
        setItems(cached.items);
        setCursor(cached.nextCursor);
        setHasSearched(true);
        return;
      }

      const currentRequestId = ++requestId;

      setLoading(true);
      setLoadingMore(false);
      setItems([]);
      setCursor(null);
      setHasSearched(false);

      void searchConversationsFn({
        data: {
          query: debouncedQuery,
          limit: PAGE_SIZE,
          cursor: null,
        },
      })
        .then((page) => {
          if (requestId !== currentRequestId) {
            return;
          }

          searchCache.set(debouncedQuery, page);
          setItems(page.items);
          setCursor(page.nextCursor);
          setHasSearched(true);
        })
        .catch((error) => {
          if (requestId !== currentRequestId) {
            return;
          }

          console.error('Failed to search conversations:', error);
          setItems([]);
          setCursor(null);
          setHasSearched(true);
        })
        .finally(() => {
          if (requestId !== currentRequestId) {
            return;
          }

          setLoading(false);
        });
    },
  );

  const loadMore = async () => {
    if (!debouncedQuery() || loading() || loadingMore() || !cursor()) {
      return;
    }

    const currentRequestId = ++requestId;
    setLoadingMore(true);

    try {
      const page = await searchConversationsFn({
        data: {
          query: debouncedQuery(),
          limit: PAGE_SIZE,
          cursor: cursor(),
        },
      });

      if (requestId !== currentRequestId) {
        return;
      }

      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setHasSearched(true);
    } catch (error) {
      if (requestId !== currentRequestId) {
        return;
      }

      console.error('Failed to load more search results:', error);
    } finally {
      if (requestId === currentRequestId) {
        setLoadingMore(false);
      }
    }
  };

  const handleSelect = (item: ConversationSearchItem) => {
    props.onClose();
    navigate({
      to: '/app/$conversationId',
      params: { conversationId: item.id },
    });
  };

  return (
    <>
      <DialogHeader class='sr-only'>
        <DialogTitle>搜索聊天记录</DialogTitle>
      </DialogHeader>

      <div class='flex items-center px-4 py-4'>
        <Search class='size-6 text-secondary' />
        <input
          autofocus
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder='你想找什么？'
          class='ml-4 flex-1 bg-transparent text-xl font-light outline-none placeholder:text-muted-foreground'
        />
        {loading() && <Loader2 class='size-5 animate-spin text-secondary' />}
      </div>

      <div class='h-[1px] w-full bg-muted' />

      <div
        class='max-h-[60vh] overflow-y-auto p-2'
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 120)
            void loadMore();
        }}
      >
        {!debouncedQuery() ? (
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>输入关键词搜索聊天记录</p>
        ) : null}

        {debouncedQuery() && !loading() && hasSearched() && items().length === 0 ? (
          <p class='px-3 py-10 text-center text-sm text-muted-foreground'>没有找到相关会话</p>
        ) : null}

        {items().length > 0 ? (
          <div class='flex flex-col gap-0.5'>
            <For each={items()}>
              {(item) => {
                const title = item.title || '未命名会话';
                const displayTitle = truncateMiddle(title, 48);

                return (
                  <button
                    type='button'
                    class='group flex w-full flex-col rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-muted active:scale-[0.98]'
                    onClick={() => handleSelect(item)}
                  >
                    <div class='flex w-full items-baseline justify-between'>
                      <span class='min-w-0 text-base font-medium text-foreground' title={title}>
                        {displayTitle}
                      </span>
                      <span class='ml-4 shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100'>
                        {formatUpdatedAt(item.updated_at)}
                      </span>
                    </div>
                    <span class='mt-0.5 truncate text-sm text-muted-foreground'>
                      {item.excerpt || '暂无可展示内容'}
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        ) : null}

        {items().length > 0 && (cursor() !== null || loadingMore()) ? (
          <div class='flex items-center justify-center py-2 text-muted-foreground'>
            {loadingMore() ? <Loader2 class='size-4 animate-spin text-secondary' /> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

export function ConversationSearchDialog(props: ConversationSearchDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <DialogContent
          class='max-h-[80vh] overflow-hidden border-0 bg-background p-0 shadow-2xl sm:max-w-2xl sm:rounded-2xl'
          showCloseButton={false}
        >
          <ConversationSearchContent onClose={() => props.onOpenChange(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
