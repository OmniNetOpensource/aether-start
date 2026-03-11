import { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import type { Message } from "@/types/message";
import type { TreeLayout } from "./tree-layout";
import { NODE_H, NODE_W } from "./tree-layout";
import { buildOutlineTree } from "./build-outline-tree";
import { computeTreeLayout } from "./tree-layout";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useMessageTreeStore } from "@/stores/zustand/useMessageTreeStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

const SCROLL_RETRY_FRAMES = 4;
const CANVAS_PADDING = 24;
const MIN_CANVAS_WIDTH = 560;
const EMPTY_HEIGHT = 240;
const EDGE_CURVE_Y = 26;
const PREVIEW_LIMIT = 18;
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

const roleColorMap: Record<Message["role"], string> = {
  user: "#3b82f6",
  assistant: "#22c55e",
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

const trimPreview = (text: string) => {
  const chars = Array.from(text);
  return chars.length <= PREVIEW_LIMIT
    ? text
    : `${chars.slice(0, PREVIEW_LIMIT).join("")}…`;
};

const buildCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
  const c1y = y1 + EDGE_CURVE_Y;
  const c2y = y2 - EDGE_CURVE_Y;
  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
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
    (targetNode?: { x: number; y: number }) => {
      const container = containerRef.current;
      if (!container || !layout) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      const fitZoom = clampZoom(
        Math.min(cw / canvasWidth, ch / canvasHeight, 1.5),
      );
      const focusX = targetNode
        ? targetNode.x + NODE_W / 2 + CANVAS_PADDING
        : canvasWidth / 2;
      const focusY = targetNode
        ? targetNode.y + NODE_H / 2 + CANVAS_PADDING
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
      className="relative h-[70vh] overflow-hidden rounded-md border border-(--border-primary) bg-(--surface-primary)"
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
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
                  strokeWidth={isCurrentPathEdge ? 2.4 : 1.4}
                  strokeOpacity={isCurrentPathEdge ? 0.95 : 0.8}
                />
              );
            })}
            {layout.nodes.map((node) => {
              const isCurrentPathNode = currentPathSet.has(node.messageId);
              const roleLabel = roleLabelMap[node.role];
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
                  onClick={() => {
                    if (disabled || didPanRef.current) return;
                    onSelect(node.messageId);
                  }}
                  onKeyDown={(event) => {
                    if (disabled) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(node.messageId);
                    }
                  }}
                >
                  <title>{`#${node.messageId} ${roleLabel} ${node.fullPreview}`}</title>
                  <rect
                    x={0}
                    y={0}
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={
                      isCurrentPathNode
                        ? "var(--surface-muted)"
                        : "var(--surface-primary)"
                    }
                    stroke={
                      isCurrentPathNode
                        ? "var(--interactive-primary)"
                        : "var(--border-primary)"
                    }
                    strokeWidth={isCurrentPathNode ? 2 : 1}
                  />
                  <circle
                    cx={12}
                    cy={14}
                    r={4}
                    fill={roleColorMap[node.role]}
                  />
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
