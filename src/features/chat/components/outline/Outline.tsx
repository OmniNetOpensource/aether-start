import { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import type { Message } from "@/types/message";
import type { TreeLayout } from "./tree-layout";
import { NODE_H, NODE_W, ROOT_R } from "./tree-layout";
import { buildOutlineTree } from "./build-outline-tree";
import { truncateTextByWidth } from "./preview-text";
import { computeTreeLayout } from "./tree-layout";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useMessageTreeStore } from "@/stores/zustand/useMessageTreeStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

const SCROLL_RETRY_FRAMES = 4;
const CANVAS_PADDING = 32;
const MIN_CANVAS_WIDTH = 560;
const EMPTY_HEIGHT = 240;
const PREVIEW_LIMIT = 20;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_WHEEL_FACTOR = 0.001;
const PAN_THRESHOLD = 3;

type Camera = { x: number; y: number; zoom: number };
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

const roleLabelMap: Record<Message["role"], string> = {
  user: "用户",
  assistant: "助手",
};

const scrollToMessage = (messageId: number) => {
  let attempts = 0;
  const tryScroll = () => {
    const target = document.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (attempts >= SCROLL_RETRY_FRAMES) return;
    attempts += 1;
    requestAnimationFrame(tryScroll);
  };
  requestAnimationFrame(tryScroll);
};

const trimPreview = (text: string) =>
  truncateTextByWidth(text, PREVIEW_LIMIT, "…");

const buildCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
};

const edgeKey = (fromId: number, toId: number) => `${fromId}:${toId}`;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function OutlineGraph({
  open,
  layout,
  currentPath,
  onSelect,
  disabled,
}: {
  open: boolean;
  layout: TreeLayout | null;
  currentPath: number[];
  onSelect: (messageId: number) => void;
  disabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [isPanning, setIsPanning] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const didPanRef = useRef(false);
  const cameraRef = useRef(camera);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const currentPathSet = new Set(currentPath);
  const currentEdgeSet = (() => {
    const next = new Set<string>();
    for (let i = 1; i < currentPath.length; i += 1) {
      next.add(edgeKey(currentPath[i - 1], currentPath[i]));
    }
    return next;
  })();

  const canvasWidth = layout
    ? Math.max(layout.width + CANVAS_PADDING * 2, MIN_CANVAS_WIDTH)
    : MIN_CANVAS_WIDTH;
  const canvasHeight = layout
    ? Math.max(layout.height + CANVAS_PADDING * 2, EMPTY_HEIGHT)
    : EMPTY_HEIGHT;

  const fitView = useCallback(
    (targetNode?: { x: number; y: number; isVirtualRoot?: boolean }) => {
      const container = containerRef.current;
      if (!container || !layout) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      const fitZoom = clampZoom(
        Math.min(cw / canvasWidth, ch / canvasHeight, 1.5),
      );
      const focusX = targetNode
        ? targetNode.x +
          (targetNode.isVirtualRoot ? ROOT_R : NODE_W / 2) +
          CANVAS_PADDING
        : canvasWidth / 2;
      const focusY = targetNode
        ? targetNode.y +
          (targetNode.isVirtualRoot ? ROOT_R : NODE_H / 2) +
          CANVAS_PADDING
        : canvasHeight / 2;

      setIsAnimating(true);
      setCamera({ x: focusX, y: focusY, zoom: fitZoom });
      setTimeout(() => setIsAnimating(false), 220);
    },
    [layout, canvasWidth, canvasHeight],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !open) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !layout || currentPath.length === 0) return;

    panStateRef.current = null;
    didPanRef.current = false;

    const nodeById = new Map<number, TreeLayout["nodes"][number]>();
    for (const node of layout.nodes) {
      nodeById.set(node.messageId, node);
    }
    const lastId = currentPath[currentPath.length - 1];
    const targetNode = nodeById.get(lastId);

    const frame1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => fitView(targetNode ?? undefined));
    });
    return () => cancelAnimationFrame(frame1);
  }, [open, layout, currentPath, fitView]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !open) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const cam = cameraRef.current;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const tx = cw / 2 - cam.x * cam.zoom;
      const ty = ch / 2 - cam.y * cam.zoom;
      const svgX = (cursorX - tx) / cam.zoom;
      const svgY = (cursorY - ty) / cam.zoom;
      const delta = -event.deltaY * ZOOM_WHEEL_FACTOR;
      const newZoom = clampZoom(cam.zoom * (1 + delta));
      const newCamX = (cw / 2 - cursorX) / newZoom + svgX;
      const newCamY = (ch / 2 - cursorY) / newZoom + svgY;
      setCamera({ x: newCamX, y: newCamY, zoom: newZoom });
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [open]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[role='button']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
    didPanRef.current = false;
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: camera.x,
      originY: camera.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pan = panStateRef.current;
    if (!pan) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (
      !didPanRef.current &&
      Math.abs(dx) < PAN_THRESHOLD &&
      Math.abs(dy) < PAN_THRESHOLD
    ) {
      return;
    }
    didPanRef.current = true;
    setCamera((prev) => ({
      ...prev,
      x: pan.originX - dx / prev.zoom,
      y: pan.originY - dy / prev.zoom,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      panStateRef.current = null;
      setIsPanning(false);
    }
  };

  if (!layout || layout.nodes.length === 0) {
    return (
      <div className="relative h-[70vh] overflow-hidden rounded-md border border-(--border-primary)">
        <div className="flex h-[240px] items-center justify-center text-xs text-(--text-tertiary)">
          暂无可导航消息
        </div>
      </div>
    );
  }

  const tx = containerSize.width / 2 - camera.x * camera.zoom;
  const ty = containerSize.height / 2 - camera.y * camera.zoom;
  const useTransition = isAnimating && !isPanning;

  return (
    <div
      ref={containerRef}
      className="relative h-[70vh] overflow-hidden rounded-md border border-(--border-primary)"
      style={{
        cursor: isPanning ? "grabbing" : "grab",
        backgroundColor: "var(--surface-primary)",
        backgroundImage:
          "radial-gradient(circle, var(--border-primary) 0.8px, transparent 0.8px)",
        backgroundSize: "20px 20px",
      }}
    >
      <svg
        width="100%"
        height="100%"
        className="block"
        role="img"
        aria-label="对话树图形导航"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <g
          transform={`translate(${tx} ${ty}) scale(${camera.zoom})`}
          style={{
            transition: useTransition ? "transform 200ms ease-out" : "none",
          }}
        >
          <g transform={`translate(${CANVAS_PADDING} ${CANVAS_PADDING})`}>
            {/* SVG defs for node shadow */}
            <defs>
              <filter
                id="node-shadow"
                x="-10%"
                y="-10%"
                width="120%"
                height="130%"
              >
                <feDropShadow
                  dx="0"
                  dy="1"
                  stdDeviation="2"
                  floodColor="#000"
                  floodOpacity="0.08"
                />
              </filter>
            </defs>

            {/* Edges */}
            {layout.edges.map((edge) => {
              const isCurrentPathEdge = currentEdgeSet.has(
                edgeKey(edge.fromId, edge.toId),
              );
              return (
                <path
                  key={edgeKey(edge.fromId, edge.toId)}
                  d={buildCurvePath(edge.x1, edge.y1, edge.x2, edge.y2)}
                  fill="none"
                  stroke={
                    isCurrentPathEdge
                      ? "var(--interactive-primary)"
                      : "var(--border-primary)"
                  }
                  strokeWidth={isCurrentPathEdge ? 2 : 1.2}
                  strokeOpacity={isCurrentPathEdge ? 1 : 0.5}
                />
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((node) => {
              if (node.isVirtualRoot) {
                return (
                  <g
                    key="virtual-root"
                    transform={`translate(${node.x} ${node.y})`}
                  >
                    <circle
                      cx={ROOT_R}
                      cy={ROOT_R}
                      r={ROOT_R}
                      fill="var(--text-tertiary)"
                    />
                  </g>
                );
              }

              const isCurrentPathNode = currentPathSet.has(node.messageId);
              const isHoveredNode = hoveredNodeId === node.messageId;
              const roleLabel = roleLabelMap[node.role];
              const nodeFill = isCurrentPathNode
                ? "color-mix(in srgb, var(--interactive-primary) 12%, var(--surface-primary))"
                : "var(--surface-secondary)";
              const nodeHoverFill = isCurrentPathNode
                ? "color-mix(in srgb, var(--interactive-primary) 16%, var(--surface-primary))"
                : "color-mix(in srgb, var(--surface-secondary) 84%, white)";
              const nodeMetaText = isCurrentPathNode
                ? "color-mix(in srgb, var(--text-primary) 72%, var(--surface-primary))"
                : "var(--text-tertiary)";
              const nodePreviewText = isCurrentPathNode
                ? "var(--text-primary)"
                : "var(--text-secondary)";
              return (
                <g
                  key={node.messageId}
                  transform={`translate(${node.x} ${node.y})`}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  style={{
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.65 : 1,
                  }}
                  onPointerEnter={() => {
                    if (disabled) return;
                    setHoveredNodeId(node.messageId);
                  }}
                  onPointerLeave={() => setHoveredNodeId((current) =>
                    current === node.messageId ? null : current,
                  )}
                  onClick={() => {
                    if (disabled || didPanRef.current) return;
                    onSelect(node.messageId);
                  }}
                >
                  <title>{`#${node.messageId} ${roleLabel} ${node.fullPreview}`}</title>

                  {/* Node card */}
                  <rect
                    x={0}
                    y={0}
                    width={NODE_W}
                    height={NODE_H}
                    rx={10}
                    fill={isHoveredNode ? nodeHoverFill : nodeFill}
                    filter="url(#node-shadow)"
                    style={{ transition: "fill 120ms ease-out" }}
                  />

                  {/* Role label */}
                  <text
                    x={14}
                    y={19}
                    fill={nodeMetaText}
                    fontSize={10}
                    fontWeight={600}
                    fontFamily="system-ui, sans-serif"
                  >
                    {roleLabel}
                  </text>

                  {/* Sibling badge */}
                  {node.siblingCount > 1 && (
                    <>
                      <rect
                        x={NODE_W - 44}
                        y={8}
                        width={36}
                        height={16}
                        rx={8}
                        fill={isHoveredNode ? nodeHoverFill : nodeFill}
                        style={{ transition: "fill 120ms ease-out" }}
                      />
                      <text
                        x={NODE_W - 26}
                        y={19}
                        fill={nodeMetaText}
                        fontSize={9}
                        textAnchor="middle"
                        fontFamily="system-ui, sans-serif"
                      >
                        {node.siblingIndex}/{node.siblingCount}
                      </text>
                    </>
                  )}

                  {/* Preview text */}
                  <text
                    x={14}
                    y={40}
                    fill={nodePreviewText}
                    fontSize={11}
                    fontWeight={500}
                    fontFamily="system-ui, sans-serif"
                  >
                    {trimPreview(node.preview)}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

export function OutlineButton() {
  const [open, setOpen] = useState(false);
  const messages = useMessageTreeStore((state) => state.messages);
  const currentPath = useMessageTreeStore((state) => state.currentPath);
  const latestRootId = useMessageTreeStore((state) => state.latestRootId);
  const selectMessage = useMessageTreeStore((state) => state.selectMessage);
  const status = useChatRequestStore((s) => s.status);
  const isBusy = status !== "done";

  const outline = (() => {
    if (!open) return null;
    const nextOutline = buildOutlineTree(messages, latestRootId);
    return {
      ...nextOutline,
      layout: computeTreeLayout(nextOutline.roots),
    };
  })();

  const handleSelect = (targetMessageId: number) => {
    if (!currentPath.includes(targetMessageId)) {
      selectMessage(targetMessageId);
    }

    setOpen(false);
    scrollToMessage(targetMessageId);
  };

  if (currentPath.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="rounded-lg"
          aria-label="对话树导航"
          title={isBusy ? "生成中，暂不可导航" : "对话树导航"}
          disabled={isBusy}
        >
          <GitBranch className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="w-[min(94vw,72rem)] p-3 sm:max-w-4xl"
        showCloseButton
      >
        <OutlineGraph
          open={open}
          layout={outline?.layout ?? null}
          currentPath={currentPath}
          onSelect={handleSelect}
          disabled={isBusy}
        />
      </DialogContent>
    </Dialog>
  );
}
