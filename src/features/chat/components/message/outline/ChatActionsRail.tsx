import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronUp, ChevronDown, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OutlineButton } from "./Outline";
import { useResponsive } from "@/components/ResponsiveContext";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";

type ChatActionsRailProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  hasScrollContainer: boolean;
};

const LEAVE_TOLERANCE_PX = 1;

function findCurrentMessageIndex(container: HTMLElement): number {
  const messages = container.querySelectorAll("[data-message-id]");
  if (messages.length === 0) return -1;

  const containerRect = container.getBoundingClientRect();
  const containerTop = containerRect.top;

  let closestIndex = -1;
  let closestDist = Infinity;

  messages.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top - containerTop);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  });

  return closestIndex;
}

export function ChatActionsRail({
  scrollRef,
  hasScrollContainer,
}: ChatActionsRailProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const railRef = useRef<HTMLDivElement | null>(null);
  const currentPath = useChatSessionStore((s) => s.currentPath);
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";

  const hasMessages = currentPath.length > 0;
  const canPrev = hasMessages && currentPath.length > 1 && currentIdx > 0;
  const canNext =
    hasMessages &&
    currentPath.length > 1 &&
    currentIdx >= 0 &&
    currentIdx < currentPath.length - 1;
  const canScrollBottom = hasScrollContainer;

  const openRail = () => setExpanded(true);
  const closeRail = () => setExpanded(false);

  const handleTriggerClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    openRail();
  };

  const handleMouseLeave = (e: ReactMouseEvent<HTMLElement>) => {
    if (isMobile) return;

    const { left } = e.currentTarget.getBoundingClientRect();
    const rightFromLeftSide = e.clientX <= left + LEAVE_TOLERANCE_PX;

    if (rightFromLeftSide) closeRail();
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateIdx = () => {
      setCurrentIdx(findCurrentMessageIndex(container));
    };

    updateIdx();
    container.addEventListener("scroll", updateIdx);
    const ro = new ResizeObserver(updateIdx);
    ro.observe(container);

    return () => {
      container.removeEventListener("scroll", updateIdx);
      ro.disconnect();
    };
  }, [scrollRef, currentPath]);

  useEffect(() => {
    if (!expanded) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (railRef.current?.contains(target)) return;
      if (target.closest("[data-outline-dialog]")) return;
      closeRail();
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [expanded]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expanded) closeRail();
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [expanded]);

  const handlePrev = () => {
    const container = scrollRef.current;
    if (!container || !canPrev) return;

    const idx = findCurrentMessageIndex(container);
    if (idx <= 0) return;

    const prevId = currentPath[idx - 1];
    const el = container.querySelector<HTMLElement>(
      `[data-message-id="${prevId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    closeRail();
  };

  const handleNext = () => {
    const container = scrollRef.current;
    if (!container || !canNext) return;

    const idx = findCurrentMessageIndex(container);
    if (idx < 0 || idx >= currentPath.length - 1) return;

    const nextId = currentPath[idx + 1];
    const el = container.querySelector<HTMLElement>(
      `[data-message-id="${nextId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    closeRail();
  };

  const handleBottom = () => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
    closeRail();
  };

  return (
    <div
      ref={railRef}
      className="absolute right-0 top-0 bottom-0 z-(--z-sidebar) flex w-0 shrink-0 group/rail-trigger max-md:hidden"
      data-chat-actions-rail
    >
      <div
        className="absolute right-0 top-0 z-(--z-sidebar) h-full w-4"
        onClick={isMobile ? handleTriggerClick : undefined}
        onMouseEnter={isMobile ? undefined : openRail}
        aria-label="展开聊天操作"
      />
      <div className="pointer-events-none absolute right-0 top-1/2 z-(--z-sidebar) h-24 w-1.5 -translate-y-1/2 rounded-l-md bg-border transition-all duration-300 group-hover/rail-trigger:w-2 " />
      {expanded && (
        <div
          className="absolute right-4 top-0 z-(--z-sidebar) flex h-full flex-col justify-center gap-1  bg-transparent p-1 shadow-lg transition-transform duration-300 ease-[var(--transition-smooth)]"
          onMouseLeave={isMobile ? undefined : handleMouseLeave}
        >
          <OutlineButton />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canPrev}
            onClick={handlePrev}
            aria-label="Previous message"
            title="Previous message"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canNext}
            onClick={handleNext}
            aria-label="Next message"
            title="Next message"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canScrollBottom}
            onClick={handleBottom}
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
