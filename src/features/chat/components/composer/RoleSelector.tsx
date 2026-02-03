"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ROLES } from "@/src/shared/config/roles";
import { useChatRequestStore } from "@/src/features/chat/store";

export function RoleSelector() {
  const currentRole = useChatRequestStore((state) => state.currentRole);
  const setCurrentRole = useChatRequestStore((state) => state.setCurrentRole);
  const [open, setOpen] = useState(false);

  const currentRoleName =
    ROLES.find((role) => role.id === currentRole)?.name ?? "角色";

  const toolButtonBaseClass =
    "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary) hover:!text-(--text-primary)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            toolButtonBaseClass,
            open && "bg-(--surface-hover) text-(--text-primary)"
          )}
        >
          <span className="max-w-[100px] truncate">{currentRoleName}</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-300",
              open && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-48 max-w-[calc(100vw-2rem)] p-1.5"
      >
        <div className="flex flex-col gap-1 px-1 py-1 max-h-[300px] overflow-y-auto">
          {ROLES.length === 0 ? (
            <div className="px-3 py-2 text-xs text-(--text-primary)">
              暂无角色
            </div>
          ) : (
            ROLES.map((role) => (
              <button
                key={role.id}
                onClick={() => {
                  setCurrentRole(role.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-3.5 rounded-lg text-xs sm:text-sm text-left transition-all duration-200 cursor-pointer hover:bg-(--surface-hover)",
                  currentRole === role.id && "font-semibold"
                )}
              >
                <span>{role.name}</span>
                {currentRole === role.id && (
                  <Check className="w-3.5 h-3.5 text-(--text-primary)" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
