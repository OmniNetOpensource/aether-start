import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Search } from 'lucide-react'
import type { ConversationSearchItem } from '@/features/conversation/model/types/conversation'
import {
  conversationRepository,
  type ConversationCursor,
} from '@/features/conversation/persistence/repository'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

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
  const [cursor, setCursor] = useState<ConversationCursor>(null)
  const [mode, setMode] = useState<'fts' | 'contains'>('fts')
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
    setMode('fts')
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
      setMode('fts')
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

    void conversationRepository
      .search({
        query: debouncedQuery,
        limit: PAGE_SIZE,
        cursor: null,
      })
      .then((page) => {
        if (requestIdRef.current !== currentRequestId) {
          return
        }

        setItems(page.items)
        setCursor(page.nextCursor)
        setMode(page.mode)
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
      const page = await conversationRepository.search({
        query: debouncedQuery,
        limit: PAGE_SIZE,
        cursor,
      })

      if (requestIdRef.current !== currentRequestId) {
        return
      }

      setItems((prev) => mergeSearchItems(prev, page.items))
      setCursor(page.nextCursor)
      setMode(page.mode)
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

  const hintText = useMemo(() => {
    return mode === 'fts' ? '英文：FTS' : '中文：包含匹配'
  }, [mode])

  const handleSelect = useCallback(
    (item: ConversationSearchItem) => {
      navigate({
        to: '/app/c/$conversationId',
        params: { conversationId: item.id },
      })
    },
    [navigate],
  )

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className='max-h-[80vh] p-0 sm:max-w-2xl' showCloseButton={false}>
        <DialogHeader className='px-5 pt-5 pb-0 text-left'>
          <DialogTitle className='text-base font-medium'>搜索聊天记录</DialogTitle>
          <DialogDescription className='text-xs text-(--text-tertiary)'>
            按标题与正文全量搜索，结果按最近更新时间排序（{hintText}）
          </DialogDescription>
        </DialogHeader>

        <div className='px-5 pb-4'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--text-tertiary)' />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='输入关键词（Ctrl/Cmd+K）'
              className='h-10 pl-9'
            />
          </div>
        </div>

        <div ref={listRootRef} className='min-h-0 flex-1 overflow-y-auto border-t px-2 pb-2'>
          {!debouncedQuery ? (
            <p className='px-3 py-10 text-center text-sm text-(--text-tertiary)'>
              输入关键词搜索聊天记录
            </p>
          ) : null}

          {debouncedQuery && loading ? (
            <div className='flex items-center justify-center py-8 text-(--text-tertiary)'>
              <Loader2 className='size-4 animate-spin' />
              <span className='ml-2 text-sm'>搜索中...</span>
            </div>
          ) : null}

          {debouncedQuery && !loading && hasSearched && items.length === 0 ? (
            <p className='px-3 py-10 text-center text-sm text-(--text-tertiary)'>
              没有找到相关会话
            </p>
          ) : null}

          {items.length > 0 ? (
            <div className='flex flex-col gap-1 pt-2'>
              {items.map((item) => {
                const title = item.title || '未命名会话'
                const badgeText = item.matchedIn === 'title' ? '标题命中' : '内容命中'

                return (
                  <button
                    key={item.id}
                    type='button'
                    className='w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-(--surface-hover)'
                    onClick={() => handleSelect(item)}
                  >
                    <div className='flex items-start gap-2'>
                      <p className='min-w-0 flex-1 truncate text-sm font-medium text-(--text-secondary)'>
                        {title}
                      </p>
                      <Badge variant='outline' className='shrink-0'>
                        {badgeText}
                      </Badge>
                    </div>
                    <p className='mt-1 line-clamp-2 text-sm text-(--text-tertiary)'>
                      {item.excerpt || '暂无可展示内容'}
                    </p>
                    <p className='mt-2 text-xs text-(--text-tertiary)'>
                      更新时间：{formatUpdatedAt(item.updated_at)}
                    </p>
                  </button>
                )
              })}
            </div>
          ) : null}

          {items.length > 0 && (hasMore || loadingMore) ? (
            <div ref={sentinelRef} className='flex items-center justify-center py-3 text-(--text-tertiary)'>
              {loadingMore ? (
                <>
                  <Loader2 className='size-4 animate-spin' />
                  <span className='ml-2 text-xs'>加载更多...</span>
                </>
              ) : (
                <span className='text-xs'>滚动加载更多...</span>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
