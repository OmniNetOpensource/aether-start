"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewChatButton as NewChatLogic } from "@/src/shared/components/NewChatButton";
import { cn } from "@/lib/utils";

interface NewChatButtonProps {
  isCollapsed?: boolean;
  variant?: "sidebar" | "topbar";
  className?: string;
}

export function NewChatButton({
  isCollapsed = false,
  variant = "sidebar",
  className,
}: NewChatButtonProps) {
  const isTopbar = variant === "topbar";

  return (
    <Button
      asChild
      variant="ghost"
      size={isTopbar ? "icon-lg" : "default"}
      className={cn(
        "group relative h-10 overflow-hidden transition-all duration-300 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
        isTopbar
          ? "w-10 rounded-lg"
          : "justify-start px-3 rounded-lg border ink-border bg-transparent text-(--text-secondary)",
        className
      )}
      style={isTopbar ? undefined : { width: isCollapsed ? 40 : "100%" }}
      aria-label="新对话"
    >
      <NewChatLogic to="/app">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
          <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
        </span>
        {isTopbar ? (
          <span className="sr-only">新对话</span>
        ) : (
          <span
            className="overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500"
            style={{
              width: isCollapsed ? 0 : "auto",
              opacity: isCollapsed ? 0 : 1,
            }}
          >
            新对话
          </span>
        )}
      </NewChatLogic>
    </Button>
  );
}
