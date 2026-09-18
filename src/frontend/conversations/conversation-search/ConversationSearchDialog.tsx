import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Loader2, Search } from '@/frontend/design-system/icons';
import type { ConversationSearchItem } from '@/frontend/conversations/session';
import {
  searchConversationsFn,
  type ConversationSearchCursor,
} from '@/frontend/conversations/session';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/design-system/dialog';
import { truncateMiddle } from '@/shared/core/truncate-middle';

const PAGE_SIZE = 20;

type SearchPage = {
  items: ConversationSearchItem[];
  nextCursor: ConversationSearchCursor;
};

const searchCache = new Map<string, SearchPage>();

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
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [morePages, setMorePages] = useState<{ query: string; pages: SearchPage[] }>({
    query: '',
    pages: [],
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const firstPageQuery = useQuery({
    queryKey: ['conversation-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) throw new Error('Cannot search without a query');

      const cached = searchCache.get(debouncedQuery);
      if (cached) return cached;

      const page = await searchConversationsFn({
        data: { query: debouncedQuery, limit: PAGE_SIZE, cursor: null },
      });
      searchCache.set(debouncedQuery, page);
      return page;
    },
    enabled: debouncedQuery.length > 0,
  });

  if (firstPageQuery.error) throw firstPageQuery.error;

  const firstPage = firstPageQuery.data ?? null;
  const extraPages = morePages.query === debouncedQuery ? morePages.pages : [];
  const items = firstPage
    ? [...firstPage.items, ...extraPages.flatMap((extra) => extra.items)]
    : [];
  const cursor = (extraPages.at(-1) ?? firstPage)?.nextCursor ?? null;
  const loading = debouncedQuery.length > 0 && firstPageQuery.isLoading;

  const loadMore = async () => {
    if (!debouncedQuery || loading || loadingMore || !cursor) {
      return;
    }

    setLoadingMore(true);
    try {
      const page = await searchConversationsFn({
        data: { query: debouncedQuery, limit: PAGE_SIZE, cursor },
      });
      setMorePages((previous) => ({
        query: debouncedQuery,
        pages: previous.query === debouncedQuery ? [...previous.pages, page] : [page],
      }));
    } catch (error) {
      console.error('Failed to load more search results:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <DialogHeader className='sr-only'>
        <DialogTitle>搜索聊天记录</DialogTitle>
      </DialogHeader>

      <div className='flex items-center px-4 py-4'>
        <Search className='size-6 text-secondary' />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder='你想找什么？'
          className='ml-4 flex-1 bg-transparent text-xl font-light outline-none placeholder:text-muted-foreground'
        />
        {loading ? <Loader2 className='size-5 animate-spin text-secondary' /> : null}
      </div>

      <div className='h-[1px] w-full bg-muted' />

      <div
        className='max-h-[60vh] overflow-y-auto p-2'
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
            void loadMore();
          }
        }}
      >
        {!debouncedQuery ? (
          <p className='px-3 py-10 text-center text-sm text-muted-foreground'>
            输入关键词搜索聊天记录
          </p>
        ) : null}

        {!loading && debouncedQuery && items.length === 0 ? (
          <p className='px-3 py-10 text-center text-sm text-muted-foreground'>没有找到相关会话</p>
        ) : null}

        {items.length > 0 ? (
          <div className='flex flex-col gap-0.5'>
            {items.map((item) => {
              const title = item.title || '未命名会话';
              const displayTitle = truncateMiddle(title, 48);

              return (
                <Link
                  key={item.id}
                  to='/app/$conversationId'
                  params={{ conversationId: item.id }}
                  className='group flex w-full flex-col rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-muted active:scale-[0.98]'
                  onClick={props.onClose}
                >
                  <div className='flex w-full items-baseline justify-between'>
                    <span className='min-w-0 text-base font-medium text-foreground' title={title}>
                      {displayTitle}
                    </span>
                    <span className='ml-4 shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100'>
                      {formatUpdatedAt(item.updated_at)}
                    </span>
                  </div>
                  <span className='mt-0.5 truncate text-sm text-muted-foreground'>
                    {item.excerpt || '暂无可展示内容'}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {items.length > 0 && (cursor !== null || loadingMore) ? (
          <div className='flex items-center justify-center py-2 text-muted-foreground'>
            {loadingMore ? <Loader2 className='size-4 animate-spin text-secondary' /> : null}
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
          className='max-h-[80vh] overflow-hidden border-0 bg-background p-0 shadow-2xl sm:max-w-2xl sm:rounded-2xl'
          showCloseButton={false}
        >
          <ConversationSearchContent onClose={() => props.onOpenChange(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
