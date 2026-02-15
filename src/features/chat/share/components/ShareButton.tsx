'use client'

import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useChatRequestStore } from '@/features/chat/api/store/useChatRequestStore'
import { useMessageTreeStore } from '@/features/chat/messages/store/useMessageTreeStore'
import { ShareDialog } from '@/features/chat/share/components/ShareDialog'
import { Button } from '@/shared/ui/button'

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
