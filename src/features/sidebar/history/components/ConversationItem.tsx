"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { ConversationMeta } from "@/features/conversation/model/types/conversation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useChatRequestStore } from "@/features/chat/api/store/useChatRequestStore";
import { useConversationsStore } from "@/features/conversation/persistence/store/useConversationsStore";

type ConversationItemProps = {
  conversation: ConversationMeta;
  isActive: boolean;
};

export function ConversationItem({
  conversation,
  isActive,
}: ConversationItemProps) {
  const title = conversation.title || "未命名会话";

  const pending = useChatRequestStore((state) => state.pending);
  const stop = useChatRequestStore((state) => state.stop);
  const navigate = useNavigate();
  const deleteConversation = useConversationsStore(
    (state) => state.deleteConversation
  );

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // 如果是修饰键点击（Ctrl/Cmd/Shift/Alt），用户意图是新标签/新窗口/下载等
    // 直接放行，不弹确认，不调用 stop()
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    // 如果正在生成，需要确认
    if (pending) {
      const confirmed = window.confirm(
        "AI正在生成内容，离开当前对话可能会丢失正在生成的内容，确定要离开吗？"
      );
      if (!confirmed) {
        e.preventDefault();
        return;
      }
    }

    // 停止当前生成，让 Link 自己完成导航
    stop();
  };

  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDelete = async () => {
    const confirmed = window.confirm("确定要删除这个会话吗？删除后无法恢复。");
    if (!confirmed) {
      return;
    }

    await deleteConversation(conversation.id);

    if (isActive) {
      navigate({ to: "/app" });
    }
  };

  return (
    <div
      className={`group relative flex w-full items-start gap-3 rounded-xl bg-transparent p-4 text-left transition-all hover:bg-black/5 dark:hover:bg-white/5 ${
        isActive ? "bg-black/5 dark:bg-white/5" : ""
      }`}
    >
      <Link
        to="/app/c/$conversationId"
        params={{ conversationId: conversation.id }}
        onClick={handleClick}
        className="absolute inset-0 z-0"
        aria-label={title}
      />
      <div className="min-w-0 flex-1 pointer-events-none relative z-10">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-(--text-secondary)">
            {title}
          </span>
        </div>
      </div>
      <div className="relative z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={handleMenuClick}
              aria-label="会话操作"
              className="flex size-7 items-center justify-center rounded-lg text-(--text-tertiary) opacity-0 transition-opacity hover:bg-(--surface-hover) hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="right"
            className="min-w-[8.5rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onSelect={() => {
                void handleDelete();
              }}
              className="text-destructive"
            >
              <Trash2 className="size-4" />
              删除会话
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
