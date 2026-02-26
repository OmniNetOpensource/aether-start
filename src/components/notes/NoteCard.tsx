import { Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NoteItem } from '@/stores/useNotesStore'

type NoteCardProps = {
  note: NoteItem
  onEdit: () => void
  onDelete: () => void
  onStartConversation: () => void
}

const truncateText = (value: string, length: number) => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= length) {
    return normalized
  }
  return `${normalized.slice(0, length)}...`
}

const formatRelativeTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const now = Date.now()
  const diffMs = Math.max(0, now - date.getTime())
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) {
    return '刚刚'
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)} 分钟前`
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} 小时前`
  }
  if (diffMs < day * 7) {
    return `${Math.floor(diffMs / day)} 天前`
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function NoteCard({
  note,
  onEdit,
  onDelete,
  onStartConversation,
}: NoteCardProps) {
  const previewText = truncateText(note.content, 100)
  const image = note.attachments.find(
    (item) => item.kind === 'image' && typeof item.url === 'string' && item.url.length > 0,
  )
  const hasText = previewText.length > 0

  return (
    <article
      role='button'
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit()
        }
      }}
      className='group flex h-full cursor-pointer flex-col gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-(--surface-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--interactive-primary)/40'
      aria-label='编辑笔记'
    >
      {image ? (
        <div className='overflow-hidden rounded-lg border bg-(--surface-muted)'>
          <img
            src={image.url}
            alt={image.name || '笔记图片'}
            className='h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]'
            loading='lazy'
          />
        </div>
      ) : null}

      <div className='flex min-h-16 flex-1 flex-col gap-2'>
        {hasText ? (
          <p className='whitespace-pre-wrap break-words text-sm text-(--text-secondary)'>
            {previewText}
          </p>
        ) : (
          <p className='text-sm text-(--text-tertiary)'>（空白笔记）</p>
        )}
        <span className='text-xs text-(--text-tertiary)'>
          {formatRelativeTime(note.updated_at)}
        </span>
      </div>

      <div className='flex items-center justify-between gap-2 pt-1'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-8 gap-1.5 px-2 text-xs'
          onClick={(event) => {
            event.stopPropagation()
            onStartConversation()
          }}
        >
          <Send className='h-3.5 w-3.5' />
          发起对话
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='h-8 w-8 text-(--text-tertiary) hover:text-destructive'
          aria-label='删除笔记'
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className='h-4 w-4' />
        </Button>
      </div>
    </article>
  )
}
