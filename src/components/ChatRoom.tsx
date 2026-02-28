import { Link, useMatch } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewChatButton } from "@/components/chat/NewChatButton";
import { OutlineButton } from "@/components/chat/outline/OutlineButton";
import { ShareButton } from "@/components/chat/share/ShareButton";
import { cn } from "@/lib/utils";

interface ChatRoomProps {
  children: React.ReactNode;
}

export function ChatRoom({ children }: ChatRoomProps) {
  const isArenaRoute = !!useMatch({ from: "/app/arena", shouldThrow: false });

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex h-16 items-center gap-3 px-4 bg-transparent">
        <div className="flex-1" />
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          className={cn(
            "rounded-lg",
            isArenaRoute
              ? "bg-(--surface-hover) text-(--text-primary)"
              : "text-(--text-secondary)"
          )}
          aria-label="Arena 模式"
        >
          <Link to="/app/arena">
            <Swords className="h-5 w-5" />
          </Link>
        </Button>
        {!isArenaRoute ? <OutlineButton /> : null}
        {!isArenaRoute ? <ShareButton /> : null}
        <NewChatButton variant="topbar" className="rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden">
        {children}
      </div>
    </div>
  );
}
