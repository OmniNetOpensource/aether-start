import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Search } from 'lucide-react'
import type { ConversationSearchItem } from '@/types/conversation'
import {
  searchConversationsFn,
  type ConversationSearchCursor,
} from '@/server/functions/conversations'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PAGE_SIZE = 20

const mergeSearchItems = (
  previous: ConversationSearchItem[],
  incoming: ConversationSearchItem[],
) => {
  const map = new Map<string, ConversationSearchItem>()

  for (const item of previous) {
    map.set(item.id, item)
  }

  for (const item of incoming) {
    map.set(item.id, item)
  }

  return Array.from(map.values()).sort((a, b) => {
    const byUpdated = b.updated_at.localeCompare(a.updated_at)
    if (byUpdated !== 0) {
      return byUpdated
    }

    return b.id.localeCompare(a.id)
  })
}

const formatUpdatedAt = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export type ConversationSearchDialogProps = {
  open: boolean
  onOpenChange: (next: boolean) => void
}

export function ConversationSearchDialog({
  open,
  onOpenChange,
}: ConversationSearchDialogProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [items, setItems] = useState<ConversationSearchItem[]>([])
  const [cursor, setCursor] = useState<ConversationSearchCursor>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const requestIdRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const listRootRef = useRef<HTMLDivElement | null>(null)

  const hasMore = cursor !== null

  const resetSearchState = useCallback(() => {
    requestIdRef.current += 1
    setDebouncedQuery('')
    setItems([])
    setCursor(null)
    setLoading(false)
    setLoadingMore(false)
    setHasSearched(false)
  }, [])

  const closeAndClear = useCallback(() => {
    onOpenChange(false)
    setQuery('')
    resetSearchState()
  }, [onOpenChange, resetSearchState])

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true)
        return
      }

      closeAndClear()
    },
    [onOpenChange, closeAndClear],
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
      resetSearchState()
      return
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 250)

    return () => window.clearTimeout(timer)
  }, [open, query, resetSearchState])

  useEffect(() => {
    if (!open) {
      return
    }

    if (!debouncedQuery) {
      setItems([])
      setCursor(null)
      setLoading(false)
      setLoadingMore(false)
      setHasSearched(false)
      return
    }

    const currentRequestId = requestIdRef.current + 1
    requestIdRef.current = currentRequestId

    setLoading(true)
    setLoadingMore(false)
    setItems([])
    setCursor(null)
    setHasSearched(false)

    void searchConversationsFn({
      data: {
        query: debouncedQuery,
        limit: PAGE_SIZE,
        cursor: null,
      },
    })
      .then((page) => {
        if (requestIdRef.current !== currentRequestId) {
          return
        }

        setItems(page.items)
        setCursor(page.nextCursor)
        setHasSearched(true)
      })
      .catch((error) => {
        if (requestIdRef.current !== currentRequestId) {
          return
        }

        console.error('Failed to search conversations:', error)
        setItems([])
        setCursor(null)
        setHasSearched(true)
      })
      .finally(() => {
        if (requestIdRef.current !== currentRequestId) {
          return
        }

        setLoading(false)
      })
  }, [open, debouncedQuery])

  const loadMore = useCallback(async () => {
    if (!open || !debouncedQuery || loading || loadingMore || !cursor) {
      return
    }

    const currentRequestId = requestIdRef.current + 1
    requestIdRef.current = currentRequestId
    setLoadingMore(true)

    try {
      const page = await searchConversationsFn({
        data: {
          query: debouncedQuery,
          limit: PAGE_SIZE,
          cursor,
        },
      })

      if (requestIdRef.current !== currentRequestId) {
        return
      }

      setItems((prev) => mergeSearchItems(prev, page.items))
      setCursor(page.nextCursor)
      setHasSearched(true)
    } catch (error) {
      if (requestIdRef.current !== currentRequestId) {
        return
      }

      console.error('Failed to load more search results:', error)
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingMore(false)
      }
    }
  }, [open, debouncedQuery, loading, loadingMore, cursor])

  useEffect(() => {
    if (!open || !hasMore || loading || loadingMore) {
      return
    }

    const target = sentinelRef.current
    if (!target) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return
        }

        void loadMore()
      },
      {
        root: listRootRef.current,
        rootMargin: '120px',
      },
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [open, hasMore, loading, loadingMore, loadMore])

  const handleSelect = useCallback(
    (item: ConversationSearchItem) => {
      closeAndClear()
      navigate({
        to: '/app/c/$conversationId',
        params: { conversationId: item.id },
      })
    },
    [navigate, closeAndClear],
  )

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent 
        className='max-h-[80vh] overflow-hidden border-0 bg-white/80 p-0 shadow-2xl backdrop-blur-xl sm:max-w-2xl sm:rounded-2xl dark:bg-black/70' 
        showCloseButton={false}
      >
        <DialogHeader className='sr-only'>
          <DialogTitle>搜索聊天记录</DialogTitle>
        </DialogHeader>

        <div className='flex items-center px-4 py-4'>
          <Search className='size-6 text-(--text-tertiary) opacity-50' />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='你想找什么？'
            className='ml-4 flex-1 bg-transparent text-xl font-light outline-none placeholder:text-(--text-tertiary)'
          />
          {loading && <Loader2 className='size-5 animate-spin text-(--text-tertiary) opacity-50' />}
        </div>

        <div className='h-[1px] w-full bg-black/5 dark:bg-white/10' />

        <div ref={listRootRef} className='max-h-[60vh] overflow-y-auto p-2'>
          {!debouncedQuery ? (
            <p className='px-3 py-10 text-center text-sm text-(--text-tertiary)'>
              输入关键词搜索聊天记录
            </p>
          ) : null}

          {debouncedQuery && !loading && hasSearched && items.length === 0 ? (
            <p className='px-3 py-10 text-center text-sm text-(--text-tertiary)'>
              没有找到相关会话
            </p>
          ) : null}

          {items.length > 0 ? (
            <div className='flex flex-col gap-0.5'>
              {items.map((item) => {
                const title = item.title || '未命名会话'

                return (
                  <button
                    key={item.id}
                    type='button'
                    className='group flex w-full flex-col rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-black/5 active:scale-[0.98] dark:hover:bg-white/10'
                    onClick={() => handleSelect(item)}
                  >
                    <div className='flex w-full items-baseline justify-between'>
                      <span className='truncate text-base font-medium text-(--text-primary)'>
                        {title}
                      </span>
                      <span className='ml-4 shrink-0 text-xs text-(--text-tertiary) opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100'>
                        {formatUpdatedAt(item.updated_at)}
                      </span>
                    </div>
                    <span className='mt-0.5 truncate text-sm text-(--text-tertiary)'>
                      {item.excerpt || '暂无可展示内容'}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {items.length > 0 && (hasMore || loadingMore) ? (
            <div ref={sentinelRef} className='flex items-center justify-center py-2 text-(--text-tertiary)'>
              {loadingMore ? (
                <Loader2 className='size-4 animate-spin opacity-50' />
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
