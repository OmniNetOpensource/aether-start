"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchItem } from "@/src/features/chat/types/chat";
import { BaseResearchCard } from "./BaseResearchCard";

type UnknownToolCardProps = {
  item: Extract<ResearchItem, { kind: "tool" }>;
  isActive?: boolean;
};

export function UnknownToolCard({
  item,
  isActive = false,
}: UnknownToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const toolName = item.data.call.tool;

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error(
        `[ResearchBlock] No UI component registered for tool: ${toolName}`
      );
    }
  }, [toolName]);

  return (
    <BaseResearchCard
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      title={`Running ${toolName}`}
      description={
        <span className="text-[10px] text-(--status-warning)">Unknown tool</span>
      }
      action={
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-all duration-200 group-hover/research-card:text-(--text-secondary)",
            isExpanded && "rotate-90"
          )}
        />
      }
      isActive={isActive}
      onClick={() => setIsExpanded((prev) => !prev)}
      buttonProps={{
        "aria-expanded": isExpanded,
        "aria-controls": contentId,
      }}
    >
      <div
        id={contentId}
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isExpanded
            ? "max-h-[280px] opacity-100"
            : "max-h-0 opacity-0"
        )}
      >
        <div className="max-h-[280px] overflow-y-auto pr-1 text-xs text-destructive/80">
          Missing UI for tool: <strong>{toolName}</strong>
        </div>
      </div>
    </BaseResearchCard>
  );
}
