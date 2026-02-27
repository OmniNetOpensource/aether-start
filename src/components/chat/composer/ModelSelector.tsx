"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useChatRequestStore } from "@/stores/useChatRequestStore"

/** 从 role id/name 推断 provider，用于分组 */
function getProviderFromRole(roleId: string, roleName: string): string {
  const lower = (roleId + roleName).toLowerCase()
  if (lower.includes("claude")) return "Anthropic"
  if (lower.includes("qwen") || lower.includes("glm")) return "国产模型"
  if (lower.includes("minimax")) return "MiniMax"
  if (lower.includes("doubao")) return "豆包"
  if (lower.includes("kimi")) return "Kimi"
  if (lower.includes("deepseek")) return "DeepSeek"
  return "其他"
}

export function ModelSelector() {
  const [open, setOpen] = React.useState(false)
  const currentRole = useChatRequestStore((state) => state.currentRole)
  const setCurrentRole = useChatRequestStore((state) => state.setCurrentRole)
  const roles = useChatRequestStore((state) => state.availableRoles)
  const loadRoles = useChatRequestStore((state) => state.loadRoles)

  React.useEffect(() => {
    loadRoles()
  }, [loadRoles])

  const currentRoleName =
    roles.find((role) => role.id === currentRole)?.name ?? "选择模型"

  // 按 provider 分组
  const grouped = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>()
    for (const role of roles) {
      const provider = getProviderFromRole(role.id, role.name)
      const list = map.get(provider) ?? []
      list.push(role)
      map.set(provider, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a === "其他" ? 1 : b === "其他" ? -1 : a.localeCompare(b)
    )
  }, [roles])

  const toolButtonBaseClass =
    "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:!text-foreground"

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          toolButtonBaseClass,
          "group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground"
        )}
      >
        <span className="max-w-25 truncate">{currentRoleName}</span>
        <ChevronDown className="h-3 w-3 transition-transform duration-300" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} label="选择模型">
        <Command className="rounded-lg border-0" loop>
          <CommandInput placeholder="搜索模型..." />
          <CommandList>
            <CommandEmpty>未找到匹配的模型</CommandEmpty>
            {grouped.map(([provider, items]) => (
              <CommandGroup key={provider} heading={provider}>
                {items.map((role) => (
                  <CommandItem
                    key={role.id}
                    value={`${role.id} ${role.name} ${provider}`}
                    onSelect={() => {
                      setCurrentRole(role.id)
                      setOpen(false)
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
  )
}
