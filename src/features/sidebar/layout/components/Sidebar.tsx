"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ConversationList } from "@/features/sidebar/history/components/ConversationList";
import { ProfileMenu } from "@/features/sidebar/profile/components/ProfileMenu";
import { NewChatButton } from "@/features/chat/session/components/NewChatButton";
import { useResponsive } from "@/features/responsive/ResponsiveContext";
import { useSidebarStore } from "@/features/sidebar/layout/store/useSidebarStore";
import { AetherLogo } from "@/shared/components/AetherLogo";

export default function Sidebar() {
  const DESKTOP_RIGHT_LEAVE_TOLERANCE_PX = 1;
  const DESKTOP_SIDEBAR_WIDTH_CLASS = "w-[22vw] min-w-[260px] max-w-[360px]";
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";
  const isDesktop = deviceType === "desktop";
  const isOpen = useSidebarStore((state) => state.isOpen);
  const setIsOpen = useSidebarStore((state) => state.setIsOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDesktopOpen, setIsDesktopOpen] = useState(false);

  const clearCloseTimer = () => {
    if (!closeTimerRef.current) {
      return;
    }
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const openDesktopSidebar = () => {
    clearCloseTimer();
    setIsDesktopOpen(true);
  };

  const scheduleDesktopClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsDesktopOpen(false);
      closeTimerRef.current = null;
    }, 120);
  };

  const handleDesktopMouseLeave = (event: ReactMouseEvent<HTMLElement>) => {
    const { right } = event.currentTarget.getBoundingClientRect();
    const leftFromRightSide = event.clientX >= right - DESKTOP_RIGHT_LEAVE_TOLERANCE_PX;

    if (leftFromRightSide) {
      scheduleDesktopClose();
      return;
    }

    clearCloseTimer();
  };

  useEffect(() => {
    if (!isMobile) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isMobile, isOpen, setIsOpen]);

  useEffect(() => {
    if (!isMobile) return;
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (isDesktop) {
      return;
    }
    clearCloseTimer();
    const resetTimer = setTimeout(() => {
      setIsDesktopOpen(false);
    }, 0);
    return () => clearTimeout(resetTimer);
  }, [isDesktop]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  if (isMobile) {
    return (
      <div
        className={`fixed inset-0 z-(--z-mobile-overlay) ${
          !isOpen ? "pointer-events-none" : ""
        }`}
      >
        {isOpen && (
          <div
            className="absolute inset-0 bg-black/50 mobile-sidebar-overlay"
            onClick={() => setIsOpen(false)}
          />
        )}

        <aside
          className={`absolute left-0 top-0 h-full mobile-sidebar-drawer z-(--z-mobile-sidebar) overflow-hidden ${
            isOpen
              ? "w-64 max-w-[80vw] transition-[width] duration-300"
              : "w-0"
          }`}
        >
          <div className="flex h-full flex-col border-r ink-border bg-(--surface-primary)">
            <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
              <div className="flex items-center">
                <AetherLogo className="h-6 text-black dark:text-white" />
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
          </div>
        </aside>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div className="relative h-full w-0 shrink-0">
        <div
          className="absolute left-0 top-0 z-(--z-sidebar) h-full w-3"
          onMouseEnter={openDesktopSidebar}
          onMouseLeave={handleDesktopMouseLeave}
        />

        <aside
          className={`absolute left-0 top-0 z-(--z-sidebar) flex h-full ${DESKTOP_SIDEBAR_WIDTH_CLASS} flex-col overflow-hidden border-r ink-border bg-(--surface-primary) transition-transform duration-300 ${
            isDesktopOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onMouseEnter={openDesktopSidebar}
          onMouseLeave={handleDesktopMouseLeave}
        >
          <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
            <div className="flex items-center">
              <AetherLogo className="h-6 text-black dark:text-white" />
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

  return (
    <aside
      className={`relative flex h-full flex-col overflow-hidden bg-(--surface-primary) transition-[width] duration-300 ${
        isOpen ? "w-64 shrink-0 border-r ink-border" : "w-0 border-r-0"
      }`}
    >
      <div
        className={`flex h-full flex-col transition-opacity duration-300 ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
          <div className="flex items-center">
            <AetherLogo className="h-6 text-black dark:text-white" />
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
      </div>
    </aside>
  );
}
