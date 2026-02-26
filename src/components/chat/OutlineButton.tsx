import { useCallback, useMemo, useState } from 'react'
import { GitBranch } from 'lucide-react'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { OutlineGraphDialog } from './OutlineGraphDialog'
import {
  buildOutlineTree,
  findPathToMessage,
} from '@/lib/chat/build-outline-tree'
import { computeTreeLayout } from '@/lib/chat/tree-layout'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { switchBranch } from '@/lib/conversation/tree/message-tree'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const SCROLL_RETRY_FRAMES = 4

const scrollToMessage = (messageId: number) => {
  let attempts = 0

  const tryScroll = () => {
    const target = document.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`
    )

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (attempts >= SCROLL_RETRY_FRAMES) {
      return
    }

    attempts += 1
    requestAnimationFrame(tryScroll)
  }

  requestAnimationFrame(tryScroll)
}

export function OutlineButton() {
  const [open, setOpen] = useState(false)

  const messages = useMessageTreeStore((state) => state.messages)
  const currentPath = useMessageTreeStore((state) => state.currentPath)
  const latestRootId = useMessageTreeStore((state) => state.latestRootId)
  const pending = useChatRequestStore((state) => state.pending)

  const outline = useMemo(() => {
    if (!open) {
      return null
    }

    const nextOutline = buildOutlineTree(messages, latestRootId)

    return {
      ...nextOutline,
      layout: computeTreeLayout(nextOutline.roots),
    }
  }, [open, messages, latestRootId])

  const handleSelect = useCallback(
    (targetMessageId: number) => {
      if (currentPath.includes(targetMessageId)) {
        setOpen(false)
        scrollToMessage(targetMessageId)
        return
      }

      if (!outline) {
        return
      }

      const targetPath = findPathToMessage(outline.parentById, targetMessageId)
      if (targetPath.length === 0) {
        return
      }

      const treeStore = useMessageTreeStore.getState()
      let nextState = treeStore._getTreeState()

      for (let index = 0; index < targetPath.length; index += 1) {
        const depth = index + 1
        const nodeId = targetPath[index]
        nextState = switchBranch(nextState, depth, nodeId)
      }

      treeStore._setTreeState({
        messages: nextState.messages,
        currentPath: nextState.currentPath,
        latestRootId: nextState.latestRootId,
        nextId: nextState.nextId,
      })

      setOpen(false)
      scrollToMessage(targetMessageId)
    },
    [currentPath, outline]
  )

  if (currentPath.length === 0) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="rounded-lg"
          aria-label="对话树导航"
          title={pending ? '生成中，暂不可导航' : '对话树导航'}
          disabled={pending}
        >
          <GitBranch className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent
        className="w-[min(94vw,72rem)] p-3 sm:max-w-4xl"
        showCloseButton
      >
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base">对话树导航</DialogTitle>
        </DialogHeader>
        <OutlineGraphDialog
          open={open}
          layout={outline?.layout ?? null}
          currentPath={currentPath}
          onSelect={handleSelect}
          disabled={pending}
        />
        <div className="pt-1 text-[11px] text-(--text-tertiary)">
          点击节点可切换到对应分支并定位消息
        </div>
      </DialogContent>
    </Dialog>
  )
}
