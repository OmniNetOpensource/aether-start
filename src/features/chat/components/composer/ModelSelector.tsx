"use client";

import * as React from "react";
import { Bot, Check, ChevronDown } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResponsive } from "@/components/ResponsiveContext";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";

/** 浠?role id/name 鎺ㄦ柇 provider锛岀敤浜庡垎缁?*/
function getProviderFromRole(roleId: string, roleName: string): string {
  const lower = (roleId + roleName).toLowerCase();
  if (lower.includes("claude")) return "Anthropic";
  if (lower.includes("gemini")) return "Gemini";
  if (lower.includes("qwen")) return "鍗冮棶";
  if (lower.includes("glm")) return "鏅鸿氨";
  if (lower.includes("minimax")) return "MiniMax";
  if (lower.includes("doubao")) return "璞嗗寘";
  if (lower.includes("kimi")) return "Kimi";
  if (lower.includes("deepseek")) return "DeepSeek";
  return "鍏朵粬";
}

export function ModelSelector() {
  const [open, setOpen] = React.useState(false);
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";
  const currentRole = useChatSessionStore((state) => state.currentRole);
  const roles = useChatSessionStore((state) => state.availableRoles);
  const loadAvailableRoles = useChatSessionStore(
    (state) => state.loadAvailableRoles,
  );
  const setCurrentRole = useChatSessionStore((state) => state.setCurrentRole);

  React.useEffect(() => {
    void loadAvailableRoles();
  }, [loadAvailableRoles]);

  const currentRoleName =
    roles.find((role) => role.id === currentRole)?.name ?? "";

  // 鎸?provider 鍒嗙粍
  const grouped = (() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const role of roles) {
      const provider = getProviderFromRole(role.id, role.name);
      const list = map.get(provider) ?? [];
      list.push(role);
      map.set(provider, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a === "鍏朵粬" ? 1 : b === "鍏朵粬" ? -1 : a.localeCompare(b),
    );
  })();

  const toolButtonBaseClass =
    "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={currentRoleName ? `閫夋嫨妯″瀷锛屽綋鍓嶄负 ${currentRoleName}` : "閫夋嫨妯″瀷"}
        title={currentRoleName || "閫夋嫨妯″瀷"}
        className={cn(
          toolButtonBaseClass,
          isMobile
            ? "w-8 px-0 group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground"
            : "group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground",
        )}
      >
        {isMobile ? (
          <Bot className="h-3.5 w-3.5" />
        ) : (
          <>
            <span className="max-w-40 truncate">{currentRoleName}</span>
            <ChevronDown className="h-3 w-3 transition-transform duration-300" />
          </>
        )}
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} label="閫夋嫨妯″瀷">
        <Command className="rounded-lg border-0" loop>
          <CommandInput placeholder="鎼滅储妯″瀷..." autoFocus={!isMobile} />
          <CommandList>
            <CommandEmpty>鏈壘鍒板尮閰嶇殑妯″瀷</CommandEmpty>
            {grouped.map(([provider, items]) => (
              <CommandGroup key={provider} heading={provider}>
                {items.map((role) => (
                  <CommandItem
                    key={role.id}
                    value={`${role.id} ${role.name} ${provider}`}
                    onSelect={() => {
                      setCurrentRole(role.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate">{role.name}</span>
                    {currentRole === role.id && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
