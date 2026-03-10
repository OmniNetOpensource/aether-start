import type { OutlineNode } from './build-outline-tree'

export const NODE_W = 140
export const NODE_H = 52
export const GAP_X = 20
export const GAP_Y = 48

export type LayoutNode = OutlineNode & {
  x: number
  y: number
}

export type LayoutEdge = {
  fromId: number
  toId: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export type TreeLayout = {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

const measureSubtreeWidth = (
  node: OutlineNode,
  subtreeWidthById: Map<number, number>,
  visiting: Set<number>
): number => {
  if (subtreeWidthById.has(node.messageId)) {
    return subtreeWidthById.get(node.messageId) ?? NODE_W
  }

  if (visiting.has(node.messageId)) {
    return NODE_W
  }

  visiting.add(node.messageId)

  const childrenWidth = node.children.reduce((sum, child, index) => {
    const gap = index > 0 ? GAP_X : 0
    return sum + gap + measureSubtreeWidth(child, subtreeWidthById, visiting)
  }, 0)

  const width = Math.max(NODE_W, childrenWidth)
  subtreeWidthById.set(node.messageId, width)
  visiting.delete(node.messageId)

  return width
}

type PositionedNode = {
  centerX: number
  topY: number
  node: LayoutNode
}

const placeNode = (
  node: OutlineNode,
  depth: number,
  startX: number,
  subtreeWidthById: Map<number, number>,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  visiting: Set<number>
): PositionedNode | null => {
  if (visiting.has(node.messageId)) {
    return null
  }

  visiting.add(node.messageId)

  const subtreeWidth = subtreeWidthById.get(node.messageId) ?? NODE_W
  const y = depth * (NODE_H + GAP_Y)
  const childPositions: PositionedNode[] = []

  if (node.children.length > 0) {
    const childrenWidth = node.children.reduce((sum, child, index) => {
      const gap = index > 0 ? GAP_X : 0
      return sum + gap + (subtreeWidthById.get(child.messageId) ?? NODE_W)
    }, 0)

    let cursorX = startX + (subtreeWidth - childrenWidth) / 2

    for (const child of node.children) {
      const childSubtreeWidth = subtreeWidthById.get(child.messageId) ?? NODE_W
      const positionedChild = placeNode(
        child,
        depth + 1,
        cursorX,
        subtreeWidthById,
        nodes,
        edges,
        visiting
      )

      if (positionedChild) {
        childPositions.push(positionedChild)
      }

      cursorX += childSubtreeWidth + GAP_X
    }
  }

  const x =
    childPositions.length > 0
      ? (childPositions[0].centerX +
          childPositions[childPositions.length - 1].centerX) /
          2 -
        NODE_W / 2
      : startX + (subtreeWidth - NODE_W) / 2

  const layoutNode: LayoutNode = {
    ...node,
    x,
    y,
  }

  nodes.push(layoutNode)

  const centerX = x + NODE_W / 2
  const bottomY = y + NODE_H

  for (const child of childPositions) {
    edges.push({
      fromId: node.messageId,
      toId: child.node.messageId,
      x1: centerX,
      y1: bottomY,
      x2: child.centerX,
      y2: child.topY,
    })
  }

  visiting.delete(node.messageId)

  return {
    centerX,
    topY: y,
    node: layoutNode,
  }
}

export const computeTreeLayout = (roots: OutlineNode[]): TreeLayout => {
  if (roots.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
    }
  }

  const subtreeWidthById = new Map<number, number>()

  for (const root of roots) {
    measureSubtreeWidth(root, subtreeWidthById, new Set())
  }

  const totalWidth = roots.reduce((sum, root, index) => {
    const gap = index > 0 ? GAP_X : 0
    return sum + gap + (subtreeWidthById.get(root.messageId) ?? NODE_W)
  }, 0)

  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  let cursorX = 0

  for (const root of roots) {
    placeNode(
      root,
      0,
      cursorX,
      subtreeWidthById,
      nodes,
      edges,
      new Set()
    )
    cursorX += (subtreeWidthById.get(root.messageId) ?? NODE_W) + GAP_X
  }

  const width = Math.max(
    totalWidth,
    ...nodes.map((node) => node.x + NODE_W)
  )
  const height = Math.max(0, ...nodes.map((node) => node.y + NODE_H))

  return {
    nodes,
    edges,
    width,
    height,
  }
}
