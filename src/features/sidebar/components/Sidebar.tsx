"use client";

import { useEffect } from "react";
import { ConversationList } from "./history/ConversationList";
import { ProfileMenu } from "./profile/ProfileMenu";
import { NewChatButton } from "./NewChatButton";
import { useResponsive } from "@/src/shared/responsive/ResponsiveContext";
import { useSidebarStore } from "@/src/features/sidebar/store/useSidebarStore";

export default function Sidebar() {
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";
  const isOpen = useSidebarStore((state) => state.isOpen);
  const setIsOpen = useSidebarStore((state) => state.setIsOpen);

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
              ? "w-72 max-w-[80vw] transition-[width] duration-300"
              : "w-0"
          }`}
        >
          <div className="flex h-full flex-col border-r ink-border bg-black/[0.02] dark:bg-white/[0.02]">
            <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
              <div className="flex items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-black text-[12px] font-bold text-white dark:bg-white dark:text-black">
                  A
                </div>
              </div>
            </div>

            <div className="px-4 pt-4">
              <NewChatButton isCollapsed={false} />
            </div>

            <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-4 py-4">
              <div className="flex h-full flex-col gap-3">
                <ConversationList />
              </div>
            </div>

            <ProfileMenu isCollapsed={false} />
          </div>
        </aside>
      </div>
    );
  }

  return (
    <aside
      className={`relative flex h-full flex-col overflow-hidden bg-black/[0.02] dark:bg-white/[0.02] transition-[width] duration-300 ${
        isOpen ? "w-72 shrink-0 border-r ink-border" : "w-0 border-r-0"
      }`}
    >
      <div
        className={`flex h-full flex-col transition-opacity duration-300 ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center border-b ink-border px-4">
          <div className="flex items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-black text-[12px] font-bold text-white dark:bg-white dark:text-black">
              A
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <NewChatButton isCollapsed={false} />
        </div>

        <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-4 py-4">
          <div className="flex h-full flex-col gap-3">
            <ConversationList />
          </div>
        </div>

        <ProfileMenu isCollapsed={false} />
      </div>
    </aside>
  );
}
