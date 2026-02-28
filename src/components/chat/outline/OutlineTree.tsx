import type { OutlineNode } from '@/lib/chat/build-outline-tree'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type OutlineTreeProps = {
  nodes: OutlineNode[]
  currentPath: number[]
  onSelect: (messageId: number) => void
  disabled?: boolean
}

const roleLabelMap: Record<OutlineNode['role'], string> = {
  user: '用户',
  assistant: '助手',
}

type OutlineNodeItemProps = {
  node: OutlineNode
  depth: number
  currentPathSet: Set<number>
  onSelect: (messageId: number) => void
  disabled: boolean
}

const OutlineNodeItem = ({
  node,
  depth,
  currentPathSet,
  onSelect,
  disabled,
}: OutlineNodeItemProps) => {
  const isCurrentPathNode = currentPathSet.has(node.messageId)

  return (
    <li className="space-y-1 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(node.messageId)}
            className={cn(
              'w-full min-w-0 rounded-md border px-2 py-1.5 text-left transition-colors overflow-hidden',
              'focus-visible:ring-2 focus-visible:ring-(--interactive-primary)/50 focus-visible:outline-none',
              isCurrentPathNode
                ? 'border-(--border-primary) bg-(--surface-muted) text-(--text-primary)'
                : 'border-transparent text-(--text-secondary) opacity-70 hover:opacity-100 hover:bg-(--surface-hover) hover:text-(--text-primary)'
            )}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none bg-(--surface-secondary) text-(--text-tertiary)">
                {roleLabelMap[node.role]}
              </span>
              <p className="min-w-0 flex-1 truncate text-xs leading-relaxed">
                {node.preview}
              </p>
              {node.siblingCount > 1 && (
                <span className="shrink-0 rounded-full border border-(--border-primary) px-1.5 py-0.5 text-[10px] leading-none text-(--text-tertiary)">
                  {node.siblingIndex}/{node.siblingCount}
                </span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="right"
            className="max-w-[min(24rem,90vw)] max-h-[min(16rem,50vh)] overflow-y-auto whitespace-pre-wrap break-words"
          >
            {node.fullPreview}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>

      {node.children.length > 0 && (
        <ul className="space-y-1">
          {node.children.map((childNode) => (
            <OutlineNodeItem
              key={childNode.messageId}
              node={childNode}
              depth={depth + 1}
              currentPathSet={currentPathSet}
              onSelect={onSelect}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OutlineTree({
  nodes,
  currentPath,
  onSelect,
  disabled = false,
}: OutlineTreeProps) {
  const currentPathSet = new Set(currentPath)

  if (nodes.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-(--text-tertiary)">
        暂无可导航消息
      </div>
    )
  }

  return (
    <div className="max-h-[min(65vh,28rem)] overflow-y-auto pr-1">
      <ul className="space-y-1">
        {nodes.map((node) => (
          <OutlineNodeItem
            key={node.messageId}
            node={node}
            depth={0}
            currentPathSet={currentPathSet}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
      </ul>
    </div>
  )
}
