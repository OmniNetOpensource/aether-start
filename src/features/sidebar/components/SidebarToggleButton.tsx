"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebarStore } from "@/src/features/sidebar/store/useSidebarStore";

export function SidebarToggleButton() {
  const isOpen = useSidebarStore((state) => state.isOpen);
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={toggle}
      aria-label={isOpen ? "收起侧边栏" : "展开侧边栏"}
      className="rounded-lg text-(--text-tertiary) transition-all hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
    >
      <PanelLeft
        className={`h-5 w-5 transition-transform duration-300 ${
          isOpen ? "" : "rotate-180"
        }`}
      />
    </Button>
  );
}
