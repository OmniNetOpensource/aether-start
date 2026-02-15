"use client";

import { useId, useState } from "react";
import {
  Check,
  ChevronRight,
  Globe,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ResearchItem } from "@/features/chat/types/chat";
import Markdown from "@/shared/components/Markdown";
import {
  getSearchResultCount,
  getToolLifecycle,
} from "../utils";
import { BaseResearchCard } from "./BaseResearchCard";

type SearchCardProps = {
  item: Extract<ResearchItem, { kind: "tool" }>;
  isActive?: boolean;
};

type SearchResult = {
  title: string;
  url: string;
  description: string;
};

const SEARCH_ERROR_PREFIXES = [
  "Error:",
  "Error executing",
  "Search API error:",
  "Search error:",
];

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
};

const parseSearchError = (rawText: string) => {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { summary: "未知错误", suggestion: "请稍后重试", detail: "" };
  }

  if (text.startsWith("Error: SERP_API_KEY")) {
    return {
      summary: "缺少 SERP_API_KEY",
      suggestion: "请配置密钥或联系管理员",
      detail: text,
    };
  }

  if (text.startsWith("Search API error:")) {
    const summary = text.replace("Search API error:", "API 错误:").trim();
    return {
      summary,
      suggestion: "请检查 API Key 或稍后重试",
      detail: text,
    };
  }

  if (text.startsWith("Search error:")) {
    const summary = text.replace("Search error:", "搜索失败:").trim();
    return {
      summary,
      suggestion: lower.includes("timed out")
        ? "请求超时，请稍后重试"
        : "请稍后重试",
      detail: text,
    };
  }

  if (text.startsWith("Error executing")) {
    const summary = text.replace("Error executing", "工具执行失败").trim();
    return {
      summary,
      suggestion: "请稍后重试",
      detail: text,
    };
  }

  if (text.startsWith("Error:")) {
    const summary = text.replace(/^Error:\s*/, "").trim();
    return {
      summary: summary || "未知错误",
      suggestion: "请稍后重试",
      detail: text,
    };
  }

  return { summary: text, suggestion: "请稍后重试", detail: text };
};

const formatSearchErrorDetails = (rawText: string) => {
  const { summary, suggestion, detail } = parseSearchError(rawText);
  const detailBlock =
    detail && detail !== summary
      ? `\n\n**原始信息**\n\n\`\`\`\n${detail}\n\`\`\``
      : "";
  return `**错误原因**：${summary}\n\n**建议**：${suggestion}${detailBlock}`;
};

const parseSearchResults = (rawResult: string): SearchResult[] | null => {
  try {
    const data = JSON.parse(rawResult);
    const rawResults =
      (Array.isArray(data?.results) && data.results) ||
      (Array.isArray(data?.rawResults) && data.rawResults) ||
      (Array.isArray(data?.web?.results) && data.web.results) ||
      [];

    if (!Array.isArray(rawResults)) {
      return null;
    }

    const normalized = rawResults
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const title =
          "title" in item && typeof item.title === "string"
            ? item.title.trim()
            : "";
        const url =
          "url" in item && typeof item.url === "string"
            ? item.url
            : "link" in item && typeof item.link === "string"
              ? item.link
              : "";
        const description =
          "description" in item && typeof item.description === "string"
            ? item.description
            : "snippet" in item && typeof item.snippet === "string"
              ? item.snippet
              : "content" in item && typeof item.content === "string"
                ? item.content
                : "";

        if (!title && !url) {
          return null;
        }

        return {
          title: title || url,
          url,
          description,
        };
      })
      .filter((item): item is SearchResult => Boolean(item?.url));

    return normalized;
  } catch {
    return null;
  }
};

type SearchResultCardProps = {
  title: string;
  url: string;
  description?: string;
  delay?: number;
};

function SearchResultCard({
  title,
  url,
  description,
  delay = 0,
}: SearchResultCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "group relative flex w-full flex-col gap-1.5 rounded-md p-2",
        "bg-(--surface-muted) border border-transparent hover:border-border hover:bg-(--surface-hover) transition-all duration-200"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-1.5">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-(--surface-hover)">
          <Globe className="h-4 w-4 text-(--text-secondary)" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-xs font-semibold leading-tight text-foreground"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          {description ? (
            <div
              className="mt-1 text-2xs text-(--text-secondary)"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {description}
            </div>
          ) : null}
          <div className="mt-1 text-2xs text-muted-foreground truncate">
            {url}
          </div>
        </div>
      </div>
    </a>
  );
}

export function SearchCard({ item, isActive = false }: SearchCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const tool = item.data;
  const { result } = getToolLifecycle(tool);
  const args = tool.call.args as Record<string, unknown>;
  const query = typeof args.query === "string" ? args.query : "";
  const resultText = typeof result?.result === "string" ? result.result : "";
  const isError = SEARCH_ERROR_PREFIXES.some((prefix) =>
    resultText.startsWith(prefix)
  );
  const errorInfo = isError ? parseSearchError(resultText) : null;
  const errorDescription = errorInfo?.summary
    ? `Failed · ${truncateText(errorInfo.summary, 20)}`
    : "Failed";
  const resultCount = result ? getSearchResultCount(resultText) : null;
  const searchResults = result ? parseSearchResults(resultText) : null;

  const description = !result ? (
    <>
      <Loader2 className="h-3 w-3 animate-spin text-foreground" />
      <span>Searching...</span>
    </>
  ) : isError ? (
    <>
      <X className="h-3 w-3 text-destructive" />
      <span>{errorDescription}</span>
    </>
  ) : resultCount === 0 ? (
    <>
      <X className="h-3 w-3 text-destructive" />
      <span>No results found</span>
    </>
  ) : typeof resultCount === "number" ? (
    <>
      <Check className="h-3 w-3 text-success" />
      <span>
        Found {resultCount} result{resultCount === 1 ? "" : "s"}
      </span>
    </>
  ) : (
    <>
      <Check className="h-3 w-3 text-success" />
      <span>Results ready</span>
    </>
  );

  return (
    <BaseResearchCard
      icon={<Search className="h-3.5 w-3.5" />}
      title={query ? `Searching: ${query}` : "Searching"}
      description={description}
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
            ? "max-h-105 opacity-100"
            : "max-h-0 opacity-0"
        )}
      >
        <div className="max-h-105 overflow-y-auto pr-1 text-xs text-(--text-secondary)">
          {!result ? null : searchResults && searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map((resultItem, index) => (
                <SearchResultCard
                  key={`${resultItem.url}-${index}`}
                  title={resultItem.title}
                  url={resultItem.url}
                  description={resultItem.description}
                  delay={index * 90}
                />
              ))}
            </div>
          ) : searchResults && searchResults.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No results found.
            </div>
          ) : isError ? (
            <div className="text-xs text-destructive">
              <Markdown content={formatSearchErrorDetails(resultText)} />
            </div>
          ) : (
            <div className="overflow-x-auto text-xs text-(--text-secondary)">
              <Markdown content={resultText} />
            </div>
          )}
        </div>
      </div>
    </BaseResearchCard>
  );
}
