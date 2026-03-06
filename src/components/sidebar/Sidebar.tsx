import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AetherLogo } from "@/components/AetherLogo";
import { NewChatButton } from "@/components/chat/NewChatButton";
import { useResponsive } from "@/components/ResponsiveContext";
import { ConversationList } from "./conversation/ConversationList";
import { NotesButton } from "./NotesButton";
import { ConversationSearchTrigger } from "./search/ConversationSearchTrigger";
import { ProfileMenu } from "./settings/ProfileMenu";

export default function Sidebar() {
  const RIGHT_LEAVE_TOLERANCE_PX = 1;
  const CLOSE_DELAY_MS = 200;
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";

  const clearCloseTimer = () => {
    if (!closeTimerRef.current) {
      return;
    }

    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const isSidebarOpen = () => {
    return !sidebarRef.current?.classList.contains("-translate-x-full");
  };

  const openSidebar = () => {
    clearCloseTimer();
    sidebarRef.current?.classList.remove("-translate-x-full");
    document.body.style.overflow = "hidden";
  };

  const closeSidebar = () => {
    sidebarRef.current?.classList.add("-translate-x-full");
    document.body.style.overflow = "";
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeSidebar();
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  };

  const handleMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    if (isMobile) {
      return;
    }

    const { right } = event.currentTarget.getBoundingClientRect();
    const leftFromRightSide = event.clientX >= right - RIGHT_LEAVE_TOLERANCE_PX;

    if (leftFromRightSide) {
      scheduleClose();
      return;
    }

    clearCloseTimer();
  };

  const handleTriggerPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isMobile) {
      return;
    }

    // Prevent the opening tap from producing a follow-up synthetic click on drawer content.
    event.preventDefault();
    event.stopPropagation();
    openSidebar();
  };

  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (
        isSidebarOpen() &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        if (
          (event.target as Element).closest?.(
            "[data-radix-popper-content-wrapper]",
          )
        ) {
          return;
        }

        closeSidebar();
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isSidebarOpen()) {
        closeSidebar();
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    return () => {
      clearCloseTimer();
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="relative z-(--z-sidebar) h-full w-0 shrink-0 group/sidebar-trigger">
      <div
        className="absolute left-0 top-0 z-(--z-sidebar) h-full w-4"
        onMouseEnter={isMobile ? undefined : openSidebar}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handleTriggerPointerDown}
        aria-label="展开侧边栏"
      />
      <div className="absolute left-0 top-1/2 z-(--z-sidebar) h-24 w-1.5 -translate-y-1/2 rounded-r-md bg-border/40 transition-all duration-300 group-hover/sidebar-trigger:w-2 group-hover/sidebar-trigger:bg-border/70 pointer-events-none" />

      <aside
        ref={sidebarRef}
        className="absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 -translate-x-full flex-col overflow-hidden bg-(--sidebar-surface) shadow-[2px_0_8px_-2px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-[var(--transition-smooth)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.2)] md:w-[22vw] md:min-w-65 md:max-w-90"
        onMouseEnter={isMobile ? undefined : openSidebar}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-20 shrink-0 items-center px-6">
          <AetherLogo className="h-5 text-foreground/90" />
        </div>

        <div className="flex flex-col gap-2 px-6 pt-2">
          <NewChatButton isCollapsed={false} />
          <ConversationSearchTrigger variant="sidebar" />
          <NotesButton />
        </div>

        <div className="relative min-h-0 flex-1">
          <div className="absolute left-0 right-0 top-0 z-10 h-6 bg-gradient-to-b from-(--sidebar-surface) to-transparent pointer-events-none" />
          <div
            ref={scrollRef}
            className="h-full overflow-x-hidden overflow-y-auto px-6 py-6"
          >
            <div className="flex h-full flex-col gap-4">
              <ConversationList scrollRootRef={scrollRef} />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-10 h-6 bg-gradient-to-t from-(--sidebar-surface) to-transparent pointer-events-none" />
        </div>

        <ProfileMenu isCollapsed={false} />
      </aside>
    </div>
  );
}
