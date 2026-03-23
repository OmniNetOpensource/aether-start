import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Message } from '@/types/message';
import type { OutlineNode } from './build-outline-tree';
import { truncateTextByWidth } from './preview-text';

const NODE_W = 160;
const NODE_H = 56;
const GAP_X = 24;
const GAP_Y = 56;

type MessageNodeData = {
  role: Message['role'];
  preview: string;
  fullPreview: string;
  siblingIndex: number;
  siblingCount: number;
  isOnPath: boolean;
};

// ── Layout ──────────────────────────────────────────────────────────

const measureWidth = (node: OutlineNode, cache: Map<number, number>): number => {
  const cached = cache.get(node.messageId);
  if (cached !== undefined) return cached;

  const childrenW = node.children.reduce(
    (sum, child, i) => sum + (i > 0 ? GAP_X : 0) + measureWidth(child, cache),
    0,
  );
  const w = Math.max(NODE_W, childrenW);
  cache.set(node.messageId, w);
  return w;
};

const buildFlowElements = (
  roots: OutlineNode[],
  currentPathSet: Set<number>,
): { nodes: Node[]; edges: Edge[] } => {
  const cache = new Map<number, number>();
  for (const root of roots) measureWidth(root, cache);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const place = (node: OutlineNode, depth: number, startX: number): number => {
    const subtreeW = cache.get(node.messageId) ?? NODE_W;
    const y = depth * (NODE_H + GAP_Y);
    const childCenters: { cx: number; id: number }[] = [];

    if (node.children.length > 0) {
      const childrenW = node.children.reduce(
        (s, c, i) => s + (i > 0 ? GAP_X : 0) + (cache.get(c.messageId) ?? NODE_W),
        0,
      );
      let cursor = startX + (subtreeW - childrenW) / 2;
      for (const child of node.children) {
        const cw = cache.get(child.messageId) ?? NODE_W;
        childCenters.push({
          cx: place(child, depth + 1, cursor),
          id: child.messageId,
        });
        cursor += cw + GAP_X;
      }
    }

    const x =
      childCenters.length > 0
        ? (childCenters[0].cx + childCenters.at(-1)!.cx) / 2 - NODE_W / 2
        : startX + (subtreeW - NODE_W) / 2;

    const onPath = currentPathSet.has(node.messageId);

    nodes.push({
      id: String(node.messageId),
      type: 'message',
      position: { x, y },
      width: NODE_W,
      height: NODE_H,
      data: {
        role: node.role,
        preview: truncateTextByWidth(node.preview, 20, '...'),
        fullPreview: node.fullPreview,
        siblingIndex: node.siblingIndex,
        siblingCount: node.siblingCount,
        isOnPath: onPath,
      } satisfies MessageNodeData,
    });

    const cx = x + NODE_W / 2;
    for (const child of childCenters) {
      const pathEdge = onPath && currentPathSet.has(child.id);
      edges.push({
        id: `e${node.messageId}-${child.id}`,
        source: String(node.messageId),
        target: String(child.id),
        style: {
          stroke: pathEdge ? 'var(--interactive-primary)' : 'var(--border-primary)',
          strokeWidth: pathEdge ? 2 : 1.2,
          opacity: pathEdge ? 1 : 0.5,
        },
      });
    }

    return cx;
  };

  let cursor = 0;
  for (const root of roots) {
    place(root, 0, cursor);
    cursor += (cache.get(root.messageId) ?? NODE_W) + GAP_X;
  }

  return { nodes, edges };
};

// ── Custom Node ─────────────────────────────────────────────────────

const invisibleHandle: React.CSSProperties = {
  opacity: 0,
  pointerEvents: 'none',
  width: 1,
  height: 1,
};

const roleLabel: Record<Message['role'], string> = {
  user: 'User',
  assistant: 'Assistant',
};

function MessageNode({ data }: NodeProps<Node<MessageNodeData, 'message'>>) {
  const meta = data.isOnPath
    ? 'color-mix(in srgb, var(--text-primary) 72%, var(--surface-primary))'
    : 'var(--text-tertiary)';

  return (
    <div
      className='cursor-pointer rounded-[10px] px-3.5 py-2 shadow-sm transition-shadow hover:shadow-md'
      style={{
        width: NODE_W,
        height: NODE_H,
        background: data.isOnPath
          ? 'color-mix(in srgb, var(--interactive-primary) 12%, var(--surface-primary))'
          : 'var(--surface-secondary)',
      }}
      title={`${roleLabel[data.role]}: ${data.fullPreview}`}
    >
      <Handle type='target' position={Position.Top} style={invisibleHandle} />
      <div className='flex items-center justify-between'>
        <span className='text-[10px] font-semibold' style={{ color: meta }}>
          {roleLabel[data.role]}
        </span>
        {data.siblingCount > 1 && (
          <span className='text-[9px]' style={{ color: meta }}>
            {data.siblingIndex}/{data.siblingCount}
          </span>
        )}
      </div>
      <div
        className='mt-0.5 truncate text-[11px] font-medium'
        style={{
          color: data.isOnPath ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        {data.preview}
      </div>
      <Handle type='source' position={Position.Bottom} style={invisibleHandle} />
    </div>
  );
}

const nodeTypes = { message: MessageNode };

// ── Component ───────────────────────────────────────────────────────

export default function OutlineGraph({
  roots,
  currentPath,
  onSelect,
  disabled,
}: {
  roots: OutlineNode[];
  currentPath: number[];
  onSelect: (messageId: number) => void;
  disabled: boolean;
}) {
  const { nodes, edges } = buildFlowElements(roots, new Set(currentPath));

  if (nodes.length === 0) {
    return (
      <div className='flex h-60 items-center justify-center rounded-md border border-(--border-primary) text-xs text-(--text-tertiary)'>
        No messages yet.
      </div>
    );
  }

  return (
    <div className='h-[70vh] rounded-md border border-(--border-primary)'>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (!disabled) onSelect(Number(node.id));
        }}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.15}
        maxZoom={3}
        style={{ background: 'var(--surface-primary)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={0.8}
          color='var(--border-primary)'
        />
      </ReactFlow>
    </div>
  );
}
