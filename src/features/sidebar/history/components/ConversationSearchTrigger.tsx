import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { ConversationSearchDialog } from '@/features/sidebar/history/components/ConversationSearchDialog'
import { Button } from '@/shared/ui/button'

export function ConversationSearchTrigger() {
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

  return (
    <>
      <Button
        type='button'
        variant='ghost'
        size='icon-lg'
        className='rounded-lg'
        aria-label='搜索聊天记录'
        title='搜索聊天记录 (Ctrl/Cmd+K)'
        onClick={() => setOpen(true)}
      >
        <Search className='h-5 w-5' />
      </Button>

      <ConversationSearchDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
