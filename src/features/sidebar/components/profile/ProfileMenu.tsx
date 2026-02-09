"use client";

import { useState } from "react";
import { Settings, User2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { SettingsModal } from "./SettingsModal";

type ProfileMenuProps = {
  isCollapsed?: boolean;
};

const menuItemClass =
  "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-(--surface-hover) hover:text-foreground [&_svg]:size-4";

export function ProfileMenu({ isCollapsed = false }: ProfileMenuProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const displayName = "Guest";
  const subtitle = "本地模式";

  return (
    <div
      className="border-t ink-border px-4 py-4 transition-all duration-500"
      style={{
        paddingLeft: isCollapsed ? 4 : 8,
        paddingRight: isCollapsed ? 4 : 8,
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
                className="flex cursor-pointer items-center gap-3 rounded-lg text-sm transition-all duration-500 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                style={{
                  width: isCollapsed ? 40 : "100%",
                  height: isCollapsed ? 40 : "auto",
                  padding: isCollapsed ? 4 : "6px 8px",
                  borderRadius: isCollapsed ? 8 : 8,
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
                    <span className="truncate text-[11px] text-(--text-tertiary)">
                      {subtitle}
                    </span>
                  </span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="min-w-[220px] p-1"
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
                    本地模式，仅保存到浏览器
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

            </PopoverContent>
          </Popover>

          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </div>
    </div>
  );
}
