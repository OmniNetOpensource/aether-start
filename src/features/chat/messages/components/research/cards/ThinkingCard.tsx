"use client";

import { useId, useState } from "react";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ResearchItem } from "@/features/chat/types/chat";
import Markdown from "@/shared/components/Markdown";
import { BaseResearchCard } from "./BaseResearchCard";

type ThinkingCardProps = {
  item: Extract<ResearchItem, { kind: "thinking" }>;
  isActive?: boolean;
};

export function ThinkingCard({ item, isActive = false }: ThinkingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  return (
    <BaseResearchCard
      icon={<Brain className="h-3.5 w-3.5" />}
      title="Thinking Process"
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
            ? "max-h-[420px] opacity-100"
            : "max-h-0 opacity-0"
        )}
      >
        <div className="max-h-[420px] overflow-y-auto overflow-x-auto pr-1 text-xs text-(--text-secondary)">
          <Markdown content={item.text} />
        </div>
      </div>
    </BaseResearchCard>
  );
}
