"use client";

import * as React from "react";
import { Check, ChevronDown, MessageSquareText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResponsive } from "@/components/ResponsiveContext";
import {
  selectAvailablePrompts,
  selectCurrentPrompt,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";

export function PromptSelector() {
  const deviceType = useResponsive();
  const isMobile = deviceType === "mobile";
  const currentPrompt = useChatRequestStore(selectCurrentPrompt);
  const prompts = useChatRequestStore(selectAvailablePrompts);
  const loadAvailablePrompts = useChatRequestStore(
    (state) => state.loadAvailablePrompts,
  );
  const setCurrentPrompt = useChatRequestStore(
    (state) => state.setCurrentPrompt,
  );

  React.useEffect(() => {
    void loadAvailablePrompts();
  }, [loadAvailablePrompts]);

  const currentPromptName =
    prompts.find((p) => p.id === currentPrompt)?.name ?? "aether";

  const toolButtonBaseClass =
    "h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium text-(--text-primary) hover:!text-(--text-primary)";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`选择提示词，当前为 ${currentPromptName}`}
          title={currentPromptName}
          className={cn(
            toolButtonBaseClass,
            isMobile
              ? "w-8 px-0 group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground"
              : "group data-[state=open]:bg-(--surface-hover) data-[state=open]:text-foreground",
          )}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          {!isMobile && (
            <>
              <span className="max-w-20 truncate">{currentPromptName}</span>
              <ChevronDown className="h-3 w-3 transition-transform duration-300" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        {prompts.map((prompt) => (
          <DropdownMenuItem
            key={prompt.id}
            onSelect={() => setCurrentPrompt(prompt.id)}
          >
            <span className="flex-1 truncate">{prompt.name}</span>
            {currentPrompt === prompt.id && (
              <Check className="h-4 w-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
