import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronUp, ChevronDown, ArrowDown } from "lucide-react";
import { MessageItem } from "./MessageItem";
import { useChatSessionStore } from "@/features/sidebar/useChatSessionStore";
import { useChatRequestStore } from "@/features/chat/request/useChatRequestStore";
import { SelectionToolbar } from "./selection-toolbar";
import { OutlineButton } from "./outline";
import { Button } from "@/components/ui/button";
import { useResponsive } from "@/components/ResponsiveContext";

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

type MessageListProps = {
  className?: string;
  listClassName?: string;
};

export function MessageList({
  className,
  listClassName,
}: MessageListProps = {}) {
  const currentPath = useChatSessionStore((state) => state.currentPath);
  const status = useChatRequestStore((s) => s.status);
  const deviceType = useResponsive();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);

  const isMobile = deviceType === "mobile";
  const hasMessages = currentPath.length > 0;
  const canPrev = hasMessages && currentPath.length > 1 && currentIdx > 0;
  const canNext =
    hasMessages &&
    currentPath.length > 1 &&
    currentIdx >= 0 &&
    currentIdx < currentPath.length - 1;

  const followBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    const behavior = status === "streaming" ? "auto" : "smooth";
    el.scrollTo({ top: el.scrollHeight, behavior });
    if (status === "streaming") {
      rafIdRef.current = requestAnimationFrame(followBottom);
    }
  };

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
    if (e.clientX <= left + LEAVE_TOLERANCE_PX) closeRail();
  };

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
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const cancelPendingScroll = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    let prevScrollTop = container.scrollTop;
    const handleScroll = () => {
      const top = container.scrollTop;
      if (top < prevScrollTop) cancelPendingScroll();
      prevScrollTop = top;
    };

    container.addEventListener("scroll", handleScroll);
    container.addEventListener("click", cancelPendingScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("click", cancelPendingScroll);
    };
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateState = () => {
      setCurrentIdx(findCurrentMessageIndex(container));
    };

    updateState();
    container.addEventListener("scroll", updateState);
    const ro = new ResizeObserver(updateState);
    ro.observe(container);

    return () => {
      container.removeEventListener("scroll", updateState);
      ro.disconnect();
    };
  }, []);

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

  const widthClass = "w-[90%] @[921px]:w-[60%]";

  return (
    <div className={`relative w-full h-full ${className ?? ""}`.trim()}>
      <div ref={scrollRef} className="w-full h-full overflow-y-auto">
        <div
          role="log"
          aria-live="polite"
          className={`flex-1 min-h-0 flex flex-col mx-auto px-1 pb-44 ${widthClass} ${listClassName ?? ""}`.trim()}
        >
          {currentPath.map((messageId, index) => {
            const isLastMessage = index === currentPath.length - 1;
            const isStreaming = isLastMessage && status === "streaming";
            const depth = index + 1;

            return (
              <MessageItem
                key={messageId}
                messageId={messageId}
                index={index}
                depth={depth}
                isStreaming={isStreaming}
              />
            );
          })}
        </div>
      </div>

      <SelectionToolbar containerRef={scrollRef} />

      <div
        ref={railRef}
        className="absolute right-0 top-0 bottom-0 z-(--z-sidebar) flex w-0 shrink-0 group/rail-trigger max-md:hidden"
        data-chat-actions-rail
      >
        <div
          className={`absolute right-0 top-0 z-(--z-sidebar) h-full w-4 ${!isMobile && "pointer-events-none"}`}
        />
        <div
          className="absolute right-0 top-1/2 z-(--z-sidebar) h-24 w-1.5 -translate-y-1/2 rounded-l-md bg-border transition-all duration-300 group-hover/rail-trigger:w-2 "
          onClick={isMobile ? handleTriggerClick : undefined}
          onMouseEnter={isMobile ? undefined : openRail}
          aria-label="展开聊天操作"
        />
        {expanded && (
          <div
            className="absolute right-4 top-0 z-(--z-sidebar) flex h-full flex-col justify-center gap-1 bg-transparent p-1 transition-transform duration-300 ease-(--transition-smooth) pointer-events-auto"
            onMouseLeave={isMobile ? undefined : handleMouseLeave}
          >
            <OutlineButton />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
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
              onClick={followBottom}
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
