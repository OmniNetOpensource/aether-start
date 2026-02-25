
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { ShareDialog } from './ShareDialog'
import { Button } from '@/components/ui/button'

export function ShareButton() {
  const [open, setOpen] = useState(false)
  const currentPath = useMessageTreeStore((state) => state.currentPath)
  const pending = useChatRequestStore((state) => state.pending)

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
        title={pending ? '生成中，暂不可分享' : '分享对话'}
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <Share2 className="h-5 w-5" />
      </Button>

      <ShareDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
