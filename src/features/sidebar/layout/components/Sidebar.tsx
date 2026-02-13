"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationList } from "@/features/sidebar/history/components/ConversationList";
import { ProfileMenu } from "@/features/sidebar/profile/components/ProfileMenu";
import { NewChatButton } from "@/features/chat/session/components/NewChatButton";
import { useResponsive } from "@/features/responsive/ResponsiveContext";
import { useSidebarStore } from "@/features/sidebar/layout/store/useSidebarStore";

export default function Sidebar() {
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
          <div className="flex h-full flex-col border-r ink-border bg-black/[0.02] dark:bg-white/[0.02]">
            <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-black text-[12px] font-bold text-white dark:bg-white dark:text-black">
                  A
                </div>
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
          onMouseLeave={scheduleDesktopClose}
        />

        <aside
          className={`absolute left-0 top-0 z-(--z-sidebar) flex h-full w-64 flex-col overflow-hidden border-r ink-border bg-black/[0.02] transition-transform duration-300 dark:bg-white/[0.02] ${
            isDesktopOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onMouseEnter={openDesktopSidebar}
          onMouseLeave={scheduleDesktopClose}
        >
          <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
            <div className="flex items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-black text-[12px] font-bold text-white dark:bg-white dark:text-black">
                A
              </div>
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
      className={`relative flex h-full flex-col overflow-hidden bg-black/[0.02] dark:bg-white/[0.02] transition-[width] duration-300 ${
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
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-black text-[12px] font-bold text-white dark:bg-white dark:text-black">
              A
            </div>
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
