"use client";

import { Link } from "@tanstack/react-router";
import React from "react";
import { useChatRequestStore } from "@/src/features/chat/store";

type LinkComponentProps = React.ComponentProps<typeof Link>;

interface NewChatButtonProps
  extends Omit<LinkComponentProps, "to"> {
  children?: React.ReactNode;
  to?: LinkComponentProps["to"];
}

export function NewChatButton({
  children,
  onClick,
  to = "/app",
  ...props
}: NewChatButtonProps) {
  const pending = useChatRequestStore((state) => state.pending);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const isModifiedClick =
      e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

    if (isModifiedClick) {
      if (onClick) {
        onClick(e);
      }
      return;
    }

    if (pending) {
      const confirmed = window.confirm(
        "AI正在生成内容，离开当前对话可能会丢失正在生成的内容，确定要离开吗？"
      );
      if (!confirmed) {
        e.preventDefault();
        return;
      }
    }

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Link to={to} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
