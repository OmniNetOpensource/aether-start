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
      className="rounded-xl text-muted-foreground transition-all hover:text-foreground"
    >
      <PanelLeft
        className={`h-5 w-5 transition-transform duration-300 ${
          isOpen ? "" : "rotate-180"
        }`}
      />
    </Button>
  );
}
