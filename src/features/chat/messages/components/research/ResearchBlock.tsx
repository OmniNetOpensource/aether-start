
import { memo, useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ResearchItem as ResearchItemData } from "@/features/chat/types/chat";
import { FetchUrlCard } from "./cards/FetchUrlCard";
import { SearchCard } from "./cards/SearchCard";
import { ThinkingCard } from "./cards/ThinkingCard";
import { UnknownToolCard } from "./cards/UnknownToolCard";

const SEARCH_TOOL_NAMES = new Set([
  "search",
  "serper_search",
  "tavily_search",
  "serp_search",
  "brave_search",
]);

type ResearchBlockProps = {
  items: ResearchItemData[];
  blockIndex: number;
  messageIndex: number;
  isActive?: boolean;
};

type ResearchBlockItemProps = {
  item: ResearchItemData;
  isActive?: boolean;
};

const ResearchBlockItem = memo(function ResearchBlockItem({
  item,
  isActive = false,
}: ResearchBlockItemProps) {
  if (item.kind === "thinking") {
    return <ThinkingCard item={item} isActive={isActive} />;
  }

  if (item.kind === "tool") {
    const toolName = item.data.call.tool;

    switch (toolName) {
      case "fetch_url":
        return <FetchUrlCard item={item} isActive={isActive} />;
      default:
        if (SEARCH_TOOL_NAMES.has(toolName)) {
          return <SearchCard item={item} isActive={isActive} />;
        }

        return <UnknownToolCard item={item} isActive={isActive} />;
    }
  }

  return null;
});

export const ResearchBlock = memo(function ResearchBlock({
  items,
  blockIndex,
  messageIndex,
  isActive = false,
}: ResearchBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  if (items.length <= 1) {
    return (
      <div className="my-2 space-y-2">
        {items.map((item, itemIndex) => {
          const itemKey = `${messageIndex}-${blockIndex}-${itemIndex}`;

          return (
            <ResearchBlockItem
              key={itemKey}
              item={item}
              isActive={isActive}
            />
          );
        })}
      </div>
    );
  }

  const previousItems = items.slice(0, -1);
  const lastItem = items[items.length - 1];
  const lastItemKey = `${messageIndex}-${blockIndex}-${items.length - 1}`;

  return (
    <div className="my-2 space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-(--text-tertiary) hover:text-(--text-secondary) hover:bg-(--surface-hover) rounded transition-colors"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
        <span>{previousItems.length} 个研究步骤</span>
      </button>
      <div
        id={contentId}
        className={cn(
          "overflow-hidden space-y-2 transition-all duration-300 ease-in-out",
          isExpanded
            ? "max-h-[9999px] opacity-100"
            : "max-h-0 opacity-0"
        )}
      >
        <>
          {previousItems.map((item, itemIndex) => {
            const itemKey = `${messageIndex}-${blockIndex}-${itemIndex}`;

            return (
              <ResearchBlockItem
                key={itemKey}
                item={item}
                isActive={isActive}
              />
            );
          })}
        </>
      </div>
      <ResearchBlockItem
        key={lastItemKey}
        item={lastItem}
        isActive={isActive}
      />
    </div>
  );
});
