import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { ConversationSearchDialog } from '@/features/sidebar/history/components/ConversationSearchDialog'
import { Button } from '@/shared/ui/button'

type ConversationSearchTriggerProps = {
  variant?: 'sidebar' | 'icon'
}

export function ConversationSearchTrigger({ variant = 'icon' }: ConversationSearchTriggerProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return
      }

      if (event.key.toLowerCase() !== 'k') {
        return
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return
      }

      event.preventDefault()
      setOpen(true)
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const isSidebar = variant === 'sidebar'

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size={isSidebar ? 'default' : 'icon-lg'}
        className={
          isSidebar
            ? 'group relative h-10 w-full justify-start overflow-hidden rounded-md border px-3 transition-all duration-300 ink-border bg-transparent text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)'
            : 'rounded-lg'
        }
        aria-label='搜索聊天记录'
        title='搜索聊天记录 (Ctrl/Cmd+K)'
        onClick={() => setOpen(true)}
      >
        {isSidebar ? (
          <>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center'>
              <Search className='h-5 w-5' />
            </span>
            <span className='overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500'>
              搜索聊天记录
            </span>
          </>
        ) : (
          <Search className='h-5 w-5' />
        )}
      </Button>

      <ConversationSearchDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
