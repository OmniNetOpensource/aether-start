
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useChatRequestStore } from '@/stores/zustand/useChatRequestStore'
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'
import { ShareDialog } from './ShareDialog'
import { Button } from '@/components/ui/button'

export function ShareButton() {
  const [open, setOpen] = useState(false)
  const currentPath = useMessageTreeStore((state) => state.currentPath)
  const requestPhase = useChatRequestStore((s) => s.requestPhase)
  const isBusy = requestPhase !== "done"

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
        aria-label="分享对话"
        title={isBusy ? '生成中，暂不可分享' : '分享对话'}
        onClick={() => setOpen(true)}
        disabled={isBusy}
      >
        <Share2 className="h-5 w-5" />
      </Button>

      <ShareDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
