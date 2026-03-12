import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatRequestStore } from '@/stores/zustand/useChatRequestStore'
import { useChatSessionStore } from '@/stores/zustand/useChatSessionStore'
import { ShareDialog } from './ShareDialog'

export function ShareButton() {
  const [open, setOpen] = useState(false)
  const currentPath = useChatSessionStore((state) => state.currentPath)
  const requestPhase = useChatRequestStore((state) => state.requestPhase)
  const isBusy = requestPhase !== 'done'

  if (currentPath.length === 0) {
    return null
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="rounded-lg"
        aria-label="Share conversation"
        title={
          isBusy
            ? 'Sharing is unavailable while a response is streaming.'
            : 'Share conversation'
        }
        onClick={() => setOpen(true)}
        disabled={isBusy}
      >
        <Share2 className="h-5 w-5" />
      </Button>

      <ShareDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
