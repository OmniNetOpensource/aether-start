import { useCallback, useMemo, useState } from 'react'
import { GitBranch } from 'lucide-react'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { OutlineTree } from './OutlineTree'
import {
  buildOutlineTree,
  findPathToMessage,
} from '@/lib/chat/build-outline-tree'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'
import { switchBranch } from '@/features/conversation/model/tree/message-tree'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

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

    return buildOutlineTree(messages, latestRootId)
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(92vw,26rem)] max-w-[26rem] p-2"
      >
        <div className="space-y-2">
          <div className="px-2 pt-1 text-xs font-medium text-(--text-secondary)">
            对话树导航
          </div>
          <OutlineTree
            nodes={outline?.roots ?? []}
            currentPath={currentPath}
            onSelect={handleSelect}
            disabled={pending}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
