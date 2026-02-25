
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { ConversationList } from "@/features/sidebar/history/components/ConversationList";
import { ProfileMenu } from "@/features/sidebar/profile/components/ProfileMenu";
import { NewChatButton } from "@/features/chat/session/components/NewChatButton";
import { AetherLogo } from "@/shared/components/AetherLogo";

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
    <div className="relative h-full w-0 shrink-0">
      {/* Reveal trigger: subtle visible hint (1px edge) so the affordance is discoverable */}
      <div
        className="absolute left-0 top-0 z-(--z-sidebar) h-full w-1.5 border-r transition-colors duration-200"
        style={{ borderColor: "var(--sidebar-reveal-hint)" }}
        onMouseEnter={openSidebar}
        onMouseLeave={handleMouseLeave}
        onClick={openSidebar}
        aria-label="展开侧边栏"
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
        <div className="px-6 pt-2">
          <NewChatButton isCollapsed={false} />
        </div>

        {/* Content: 24px rhythm, less visual noise */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-6 py-6"
        >
          <div className="flex h-full flex-col gap-4">
            <ConversationList scrollRootRef={scrollRef} />
          </div>
        </div>

        <ProfileMenu isCollapsed={false} />
      </aside>
    </div>
  );
}
