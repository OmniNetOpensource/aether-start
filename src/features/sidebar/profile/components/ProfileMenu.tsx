
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, User2 } from "lucide-react";
import { authClient } from "@/features/auth/client/auth-client";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { clearConversationEventCursors } from "@/features/chat/api/client/websocket-client";
import { useComposerStore } from "@/stores/useComposerStore";
import { useEditingStore } from "@/stores/useEditingStore";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { useConversationsStore } from "@/stores/useConversationsStore";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SettingsModal } from "./SettingsModal";

type ProfileMenuProps = {
  isCollapsed?: boolean;
};

const menuItemClass =
  "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-(--surface-hover) hover:text-foreground [&_svg]:size-4";

export function ProfileMenu({ isCollapsed = false }: ProfileMenuProps) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName =
    session?.user.name ||
    session?.user.email?.split("@")[0] ||
    "User";
  const subtitle = session?.user.email || "";

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      useChatRequestStore.getState().clear();
      useComposerStore.getState().clear();
      useEditingStore.getState().clear();
      useMessageTreeStore.getState().clear();
      useConversationsStore.getState().reset();
      clearConversationEventCursors();
      await navigate({ href: "/auth", replace: true });
      setIsSigningOut(false);
    }
  };

  return (
    <div
      className="border-t ink-border py-5 transition-all duration-500"
      style={{
        paddingLeft: isCollapsed ? 16 : 24,
        paddingRight: isCollapsed ? 16 : 24,
      }}
    >
      <div className="flex">
        <div
          className="relative transition-all duration-500 mx-auto"
          style={{ width: isCollapsed ? "auto" : "100%" }}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-3 rounded-md text-sm transition-all duration-500 hover:bg-(--surface-hover) hover:text-foreground"
                style={{
                  width: isCollapsed ? 40 : "100%",
                  height: isCollapsed ? 40 : "auto",
                  padding: isCollapsed ? 4 : "6px 8px",
                  borderRadius: isCollapsed ? 6 : 6,
                  justifyContent: isCollapsed ? "center" : "flex-start",
                }}
              >
                <span
                  className={`flex min-w-0 items-center shrink-0 transition-all duration-500 ${
                    isCollapsed ? "gap-0" : "gap-2"
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-sm font-semibold">
                      <User2 className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="flex min-w-0 flex-col text-left transition-all duration-500 overflow-hidden"
                    style={{
                      width: isCollapsed ? 0 : "auto",
                      opacity: isCollapsed ? 0 : 1,
                    }}
                  >
                    <span className="truncate text-sm font-semibold text-foreground">
                      {displayName}
                    </span>
                  </span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="min-w-55 p-1"
            >
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-xs font-semibold">
                    <User2 className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {displayName}
                    </span>
                  </div>
                  <div className="text-xs leading-tight text-muted-foreground">
                    {subtitle || "已登录"}
                  </div>
                </div>
              </div>

              <div className="bg-border -mx-1 my-1 h-px" />

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className={menuItemClass}
              >
                <Settings className="h-4 w-4" />
                设置
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className={menuItemClass}
                disabled={isSigningOut}
              >
                <LogOut className="h-4 w-4" />
                {isSigningOut ? "退出中..." : "退出登录"}
              </button>
            </PopoverContent>
          </Popover>

          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </div>
    </div>
  );
}
