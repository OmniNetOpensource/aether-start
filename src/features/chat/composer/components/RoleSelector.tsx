"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { ROLES } from "@/features/chat/session/config/roles";
import { useChatRequestStore } from "@/features/chat/api/store/useChatRequestStore";

export function RoleSelector() {
  const currentRole = useChatRequestStore((state) => state.currentRole);
  const setCurrentRole = useChatRequestStore((state) => state.setCurrentRole);

  const currentRoleName =
    ROLES.find((role) => role.id === currentRole)?.name ?? "角色";

  const toolButtonBaseClass =
    "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            toolButtonBaseClass,
            "group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground"
          )}
        >
          <span className="max-w-25 truncate">{currentRoleName}</span>
          <ChevronDown
            className="h-3 w-3 transition-transform duration-300 group-data-[state=open]:rotate-180"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-48 max-w-[calc(100vw-2rem)] p-1.5"
      >
        <div className="flex flex-col gap-1 px-1 py-1 max-h-75 overflow-y-auto">
          {ROLES.length === 0 ? (
            <div className="px-3 py-2 text-xs text-foreground">
              暂无角色
            </div>
          ) : (
            ROLES.map((role) => (
              <PopoverClose key={role.id} asChild>
                <button
                  onClick={() => setCurrentRole(role.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-3.5 rounded-lg text-xs sm:text-sm text-left transition-all duration-200 cursor-pointer hover:bg-(--surface-hover)",
                    currentRole === role.id && "font-semibold"
                  )}
                >
                  <span>{role.name}</span>
                  {currentRole === role.id && (
                    <Check className="w-3.5 h-3.5 text-foreground" />
                  )}
                </button>
              </PopoverClose>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
