
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ConversationList } from "./conversation/ConversationList";
import { ConversationSearchTrigger } from "./search/ConversationSearchTrigger";
import { ProfileMenu } from "./settings/ProfileMenu";
import { NewChatButton } from "@/components/chat/NewChatButton";
import { AetherLogo } from "@/components/AetherLogo";
import { NotesButton } from "./NotesButton";
import { LeaderboardButton } from "./LeaderboardButton";

export default function Sidebar() {
  const RIGHT_LEAVE_TOLERANCE_PX = 1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

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

  const CLOSE_DELAY_MS = 200;

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeSidebar();
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  };

  const handleMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    const { right } = event.currentTarget.getBoundingClientRect();
    const leftFromRightSide = event.clientX >= right - RIGHT_LEAVE_TOLERANCE_PX;

    if (leftFromRightSide) {
      scheduleClose();
      return;
    }

    clearCloseTimer();
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isSidebarOpen() && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        if ((e.target as Element).closest?.('[data-radix-popper-content-wrapper]')) {
          return;
        }
        closeSidebar();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSidebarOpen()) {
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
      {/* Invisible wider catch area to make it easier to trigger */}
      <div
        className="absolute left-0 top-0 z-(--z-sidebar) h-full w-4"
        onMouseEnter={openSidebar}
        onMouseLeave={handleMouseLeave}
        onClick={openSidebar}
        aria-label="展开侧边栏"
      />
      {/* Visible physical handle affordance */}
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 z-(--z-sidebar) h-24 w-1.5 rounded-r-md transition-all duration-300 bg-border/40 group-hover/sidebar-trigger:w-2 group-hover/sidebar-trigger:bg-border/70 pointer-events-none"
      />

      <aside
        ref={sidebarRef}
        className="absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 md:w-[22vw] md:min-w-65 md:max-w-90 flex-col overflow-hidden bg-(--sidebar-surface) shadow-[2px_0_8px_-2px_rgba(0,0,0,0.04)] dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.2)] transition-transform duration-300 ease-[var(--transition-smooth)] -translate-x-full"
        onMouseEnter={openSidebar}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header: more breathing room, lighter logo */}
        <div className="flex h-20 shrink-0 items-center px-6">
          <AetherLogo className="h-5 text-foreground/90" />
        </div>

        {/* Primary action: generous spacing */}
        <div className="flex flex-col gap-2 px-6 pt-2">
          <NewChatButton isCollapsed={false} />
          <ConversationSearchTrigger variant="sidebar" />
          <NotesButton />
          <LeaderboardButton />
        </div>

        {/* Content: 24px rhythm, less visual noise */}
        <div className="relative flex-1 min-h-0">
          <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-(--sidebar-surface) to-transparent z-10 pointer-events-none" />
          <div
            ref={scrollRef}
            className="h-full overflow-x-hidden overflow-y-auto px-6 py-6"
          >
            <div className="flex h-full flex-col gap-4">
              <ConversationList scrollRootRef={scrollRef} />
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-(--sidebar-surface) to-transparent z-10 pointer-events-none" />
        </div>

        <ProfileMenu isCollapsed={false} />
      </aside>
    </div>
  );
}
