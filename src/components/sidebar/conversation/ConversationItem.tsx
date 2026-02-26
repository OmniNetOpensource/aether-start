import { Link, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { ConversationMeta } from "@/types/conversation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useConversationsStore } from "@/stores/useConversationsStore";

const PLACEHOLDER_TITLES = ["New Chat", "未命名会话"];

function isPlaceholderTitle(title: string | null): boolean {
  if (!title || !title.trim()) return true;
  return PLACEHOLDER_TITLES.includes(title.trim());
}

type ConversationItemProps = {
  conversation: ConversationMeta;
  isActive: boolean;
};

export function ConversationItem({
  conversation,
  isActive,
}: ConversationItemProps) {
  const title = conversation.title || "未命名会话";
  const useShimmer = isPlaceholderTitle(conversation.title);

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
      className={`group relative flex w-full items-start gap-3 rounded-lg bg-transparent p-3 text-left transition-all hover:bg-(--surface-hover) ${
        isActive ? "bg-(--surface-hover)" : "opacity-80 hover:opacity-100"
      }`}
    >
      {isActive && (
        <div className="absolute left-0 top-[30%] bottom-[30%] w-[3px] rounded-r-full bg-foreground shadow-[0_0_8px_rgba(0,0,0,0.1)] dark:shadow-[0_0_8px_rgba(255,255,255,0.1)]" />
      )}
      <Link
        to="/app/c/$conversationId"
        params={{ conversationId: conversation.id }}
        onClick={handleClick}
        className="absolute inset-0 z-0"
        aria-label={title}
      />
      <div className="min-w-0 flex-1 pointer-events-none relative z-10">
        <div className="flex min-w-0 items-center gap-2">
          {useShimmer ? (
            <Shimmer
              as="span"
              className="min-w-0 flex-1 truncate text-sm font-medium text-(--text-secondary)"
            >
              {title}
            </Shimmer>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--text-secondary)">
              {title}
            </span>
          )}
        </div>
      </div>
      <div className="relative z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={handleMenuClick}
              aria-label="会话操作"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-(--surface-hover) hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="right"
            className="min-w-34"
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
