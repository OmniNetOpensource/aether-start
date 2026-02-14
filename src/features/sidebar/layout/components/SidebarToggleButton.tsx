"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useSidebarStore } from "@/features/sidebar/layout/store/useSidebarStore";

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
      className="rounded-md text-(--text-tertiary) transition-all hover:bg-(--surface-hover) hover:text-(--text-primary)"
    >
      <PanelLeft
        className={`h-5 w-5 transition-transform duration-300 ${
          isOpen ? "" : "rotate-180"
        }`}
      />
    </Button>
  );
}
