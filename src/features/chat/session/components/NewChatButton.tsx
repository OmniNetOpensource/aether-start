"use client";

import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode, MouseEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useChatRequestStore } from "@/features/chat/api/store/useChatRequestStore";

type LinkComponentProps = ComponentProps<typeof Link>;

interface NewChatButtonProps extends Omit<LinkComponentProps, "to"> {
  isCollapsed?: boolean;
  variant?: "sidebar" | "topbar";
  className?: string;
  children?: ReactNode;
  to?: LinkComponentProps["to"];
}

export function NewChatButton({
  isCollapsed = false,
  variant = "sidebar",
  className,
  children,
  onClick,
  to = "/app",
  ...props
}: NewChatButtonProps) {
  const pending = useChatRequestStore((state) => state.pending);
  const isTopbar = variant === "topbar";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const isModifiedClick =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

    if (isModifiedClick) {
      if (onClick) {
        onClick(event);
      }
      return;
    }

    if (pending) {
      const confirmed = window.confirm(
        "AI正在生成内容，离开当前对话可能会丢失正在生成的内容，确定要离开吗？"
      );
      if (!confirmed) {
        event.preventDefault();
        return;
      }
    }

    if (onClick) {
      onClick(event);
    }
  };

  const defaultContent = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <Pencil className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
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
    </>
  );

  return (
    <Button
      asChild
      variant="ghost"
      size={isTopbar ? "icon-lg" : "default"}
      className={cn(
        "group relative h-10 overflow-hidden transition-all duration-300 hover:bg-(--surface-hover) hover:text-(--text-primary)",
        isTopbar
          ? "w-10 rounded-lg"
          : "justify-start px-3 rounded-md border ink-border bg-transparent text-(--text-secondary)",
        className
      )}
      style={isTopbar ? undefined : { width: isCollapsed ? 40 : "100%" }}
      aria-label="新对话"
    >
      <Link to={to} onClick={handleClick} {...props}>
        {children ?? defaultContent}
      </Link>
    </Button>
  );
}
