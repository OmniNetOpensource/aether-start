import { useEffect, useMemo, useRef } from 'react'
import type { Message } from '@/types/message'
import type { TreeLayout } from '@/lib/chat/tree-layout'
import { NODE_H, NODE_W } from '@/lib/chat/tree-layout'

const CANVAS_PADDING = 24
const MIN_CANVAS_WIDTH = 560
const EMPTY_HEIGHT = 240
const EDGE_CURVE_Y = 26
const PREVIEW_LIMIT = 18

type OutlineGraphDialogProps = {
  open: boolean
  layout: TreeLayout | null
  currentPath: number[]
  onSelect: (messageId: number) => void
  disabled?: boolean
}

const roleLabelMap: Record<Message['role'], string> = {
  user: '用户',
  assistant: '助手',
}

const roleColorMap: Record<Message['role'], string> = {
  user: '#3b82f6',
  assistant: '#22c55e',
}

const trimPreview = (text: string) => {
  const chars = Array.from(text)
  if (chars.length <= PREVIEW_LIMIT) {
    return text
  }

  return `${chars.slice(0, PREVIEW_LIMIT).join('')}…`
}

const buildCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
  const c1y = y1 + EDGE_CURVE_Y
  const c2y = y2 - EDGE_CURVE_Y
  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`
}

const edgeKey = (fromId: number, toId: number) => `${fromId}:${toId}`

export function OutlineGraphDialog({
  open,
  layout,
  currentPath,
  onSelect,
  disabled = false,
}: OutlineGraphDialogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const currentPathSet = useMemo(() => new Set(currentPath), [currentPath])
  const currentEdgeSet = useMemo(() => {
    const next = new Set<string>()
    for (let index = 1; index < currentPath.length; index += 1) {
      next.add(edgeKey(currentPath[index - 1], currentPath[index]))
    }
    return next
  }, [currentPath])

  const nodeById = useMemo(() => {
    const map = new Map<number, TreeLayout['nodes'][number]>()
    if (!layout) {
      return map
    }

    for (const node of layout.nodes) {
      map.set(node.messageId, node)
    }

    return map
  }, [layout])

  useEffect(() => {
    if (!open || !layout || currentPath.length === 0) {
      return
    }

    const lastId = currentPath[currentPath.length - 1]
    const targetNode = nodeById.get(lastId)
    if (!targetNode) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    let frame1 = 0
    let frame2 = 0

    const scrollToTarget = () => {
      const targetX = targetNode.x + NODE_W / 2 + CANVAS_PADDING
      const targetY = targetNode.y + NODE_H / 2 + CANVAS_PADDING

      container.scrollTo({
        left: Math.max(0, targetX - container.clientWidth / 2),
        top: Math.max(0, targetY - container.clientHeight / 2),
        behavior: 'smooth',
      })
    }

    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(scrollToTarget)
    })

    return () => {
      cancelAnimationFrame(frame1)
      cancelAnimationFrame(frame2)
    }
  }, [open, layout, nodeById, currentPath])

  if (!layout || layout.nodes.length === 0) {
    return (
      <div className="max-h-[70vh] overflow-auto rounded-md border border-(--border-primary)">
        <div className="flex h-[240px] items-center justify-center text-xs text-(--text-tertiary)">
          暂无可导航消息
        </div>
      </div>
    )
  }

  const canvasWidth = Math.max(layout.width + CANVAS_PADDING * 2, MIN_CANVAS_WIDTH)
  const canvasHeight = Math.max(layout.height + CANVAS_PADDING * 2, EMPTY_HEIGHT)

  return (
    <div
      ref={containerRef}
      className="max-h-[70vh] overflow-auto rounded-md border border-(--border-primary) bg-(--surface-primary)"
    >
      <svg
        width={canvasWidth}
        height={canvasHeight}
        className="block"
        role="img"
        aria-label="对话树图形导航"
      >
        <g transform={`translate(${CANVAS_PADDING} ${CANVAS_PADDING})`}>
          {layout.edges.map((edge) => {
            const isCurrentPathEdge = currentEdgeSet.has(
              edgeKey(edge.fromId, edge.toId)
            )

            return (
              <path
                key={edgeKey(edge.fromId, edge.toId)}
                d={buildCurvePath(edge.x1, edge.y1, edge.x2, edge.y2)}
                fill="none"
                stroke={
                  isCurrentPathEdge
                    ? 'var(--interactive-primary)'
                    : 'var(--border-primary)'
                }
                strokeWidth={isCurrentPathEdge ? 2.4 : 1.4}
                strokeOpacity={isCurrentPathEdge ? 0.95 : 0.8}
              />
            )
          })}

          {layout.nodes.map((node) => {
            const isCurrentPathNode = currentPathSet.has(node.messageId)
            const roleLabel = roleLabelMap[node.role]

            return (
              <g
                key={node.messageId}
                transform={`translate(${node.x} ${node.y})`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                style={{
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.65 : 1,
                }}
                onClick={() => {
                  if (disabled) {
                    return
                  }
                  onSelect(node.messageId)
                }}
                onKeyDown={(event) => {
                  if (disabled) {
                    return
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(node.messageId)
                  }
                }}
              >
                <title>{`#${node.messageId} ${roleLabel} ${node.preview}`}</title>
                <rect
                  x={0}
                  y={0}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={
                    isCurrentPathNode
                      ? 'var(--surface-muted)'
                      : 'var(--surface-primary)'
                  }
                  stroke={
                    isCurrentPathNode
                      ? 'var(--interactive-primary)'
                      : 'var(--border-primary)'
                  }
                  strokeWidth={isCurrentPathNode ? 2 : 1}
                />

                <circle cx={12} cy={14} r={4} fill={roleColorMap[node.role]} />
                <text
                  x={22}
                  y={17}
                  fill="var(--text-tertiary)"
                  fontSize={10}
                  fontWeight={600}
                >
                  {roleLabel}
                </text>

                <text
                  x={12}
                  y={36}
                  fill="var(--text-secondary)"
                  fontSize={11}
                  fontWeight={500}
                >
                  {trimPreview(node.preview)}
                </text>

                {node.siblingCount > 1 && (
                  <>
                    <rect
                      x={NODE_W - 42}
                      y={7}
                      width={34}
                      height={14}
                      rx={7}
                      fill="var(--surface-muted)"
                      stroke="var(--border-primary)"
                      strokeWidth={1}
                    />
                    <text
                      x={NODE_W - 25}
                      y={17}
                      fill="var(--text-tertiary)"
                      fontSize={9}
                      textAnchor="middle"
                    >
                      {node.siblingIndex}/{node.siblingCount}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
