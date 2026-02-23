
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
  const overlayRef = useRef<HTMLDivElement>(null);

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
    overlayRef.current?.classList.remove("pointer-events-none", "opacity-0");
    document.body.style.overflow = "hidden";
  };

  const closeSidebar = () => {
    sidebarRef.current?.classList.add("-translate-x-full");
    overlayRef.current?.classList.add("pointer-events-none", "opacity-0");
    document.body.style.overflow = "";
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeSidebar();
      closeTimerRef.current = null;
    }, 120);
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
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[calc(var(--z-sidebar)-1)] pointer-events-none opacity-0 transition-opacity duration-300"
        onClick={closeSidebar}
      />

      <div
        className="absolute left-0 top-0 z-(--z-sidebar) h-full w-1.25"
        onMouseEnter={openSidebar}
        onMouseLeave={handleMouseLeave}
        onClick={openSidebar}
      />

      <aside
        ref={sidebarRef}
        className="absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 md:w-[22vw] md:min-w-65 md:max-w-90 flex-col overflow-hidden border-r ink-border bg-background transition-transform duration-300 -translate-x-full"
        onMouseEnter={openSidebar}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
          <div className="flex items-center">
            <AetherLogo className="h-6 text-foreground" />
          </div>
        </div>

        <div className="px-4 pt-4">
          <NewChatButton isCollapsed={false} />
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-4 py-4"
        >
          <div className="flex h-full flex-col gap-3">
            <ConversationList scrollRootRef={scrollRef} />
          </div>
        </div>

        <ProfileMenu isCollapsed={false} />
      </aside>
    </div>
  );
}
