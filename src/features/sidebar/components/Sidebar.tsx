"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

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
          className={`absolute left-0 top-0 h-full bg-(--surface-primary) mobile-sidebar-drawer z-(--z-mobile-sidebar) overflow-hidden ${
            isOpen
              ? "w-[80vw] max-w-xs transition-[width] duration-300"
              : "w-0"
          }`}
        >
          <div className="flex h-full flex-col bg-(--surface-primary)">
            <div className="flex items-center justify-between px-3 h-14 shrink-0">
              <div className="h-10 w-10" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="关闭侧边栏"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-(--surface-hover) hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-3 pb-4">
              <NewChatButton isCollapsed={false} />
            </div>

            <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-4 py-2">
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
      className={`relative flex h-full flex-col overflow-hidden bg-(--surface-primary) transition-[width] duration-300 ${
        isOpen ? "w-52 shrink-0" : "w-0"
      }`}
    >
      <div
        className={`flex h-full flex-col transition-opacity duration-300 ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <div className="flex items-center px-3 h-14 shrink-0">
          <div className="h-10 w-10" aria-hidden="true" />
        </div>

        <div className="px-3 pb-4">
          <NewChatButton isCollapsed={false} />
        </div>

        <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-4 py-2">
          <div className="flex h-full flex-col gap-3">
            <ConversationList />
          </div>
        </div>

        <ProfileMenu isCollapsed={false} />
      </div>
    </aside>
  );
}
