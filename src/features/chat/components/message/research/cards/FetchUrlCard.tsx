"use client";

import { useState } from "react";
import { Captions, Check, ChevronDown, Image as ImageIcon, Link, Loader2, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ResearchItem } from "@/features/chat/types/chat";
import { ImagePreview } from "@/shared/components/ImagePreview";
import Markdown from "@/shared/components/Markdown";
import { BaseResearchCard } from "./BaseResearchCard";
import { getToolLifecycle } from "../utils";

type FetchUrlCardProps = {
  item: Extract<ResearchItem, { kind: "tool" }>;
  isActive?: boolean;
};

type ImageResult = {
  type: "image";
  data_url: string;
  mime_type: string;
  size_bytes: number;
  source: "direct" | "screenshot";
};

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
};

const parseImageResult = (resultText: string): ImageResult | null => {
  try {
    const parsed = JSON.parse(resultText);
    if (parsed.type === "image" && parsed.data_url) {
      return parsed as ImageResult;
    }
  } catch {
    // Not JSON or not an image result
  }
  return null;
};

const parseFetchError = (rawText: string) => {
  const text = rawText.trim();

  if (!text) {
    return { summary: "未知错误", suggestion: "请稍后重试", detail: "" };
  }

  if (text.startsWith("[系统提示:") && text.includes("内容过长")) {
    return {
      summary: "内容过长，已省略",
      suggestion: "请缩小范围或使用更具体的链接",
      detail: text,
    };
  }

  if (text.startsWith("Error: HTTP")) {
    const summary = text.replace("Error:", "HTTP 错误:").trim();
    return {
      summary,
      suggestion: "请检查链接是否可访问或稍后重试",
      detail: text,
    };
  }

  if (text.startsWith("Error fetching URL:")) {
    const summary = text.replace("Error fetching URL:", "抓取失败:").trim();
    return {
      summary,
      suggestion: "请检查链接或网络后重试",
      detail: text,
    };
  }

  if (text.startsWith("Error")) {
    const summary = text.replace(/^Error:\s*/, "").trim();
    return {
      summary: summary || "未知错误",
      suggestion: "请稍后重试",
      detail: text,
    };
  }

  return { summary: text, suggestion: "请稍后重试", detail: text };
};

export function FetchUrlCard({ item, isActive = false }: FetchUrlCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tool = item.data;
  const { result } = getToolLifecycle(tool);
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === "string" ? args.url : "";
  const responseType = typeof args.response_type === "string" ? args.response_type : "markdown";
  const resultText = typeof result?.result === "string" ? result.result : "";

  // Check if result is an image
  const imageResult = parseImageResult(resultText);
  const isImageMode = responseType === "image";
  const isYoutubeMode = responseType === "youtube";

  const isSystemPromptTooLong =
    resultText.startsWith("[系统提示:") &&
    (resultText.includes("内容过长") || resultText.includes("已省略不返回"));
  const isError = resultText.startsWith("Error") || isSystemPromptTooLong;
  const errorInfo = isError ? parseFetchError(resultText) : null;
  const hasMarkdownContent =
    (responseType === "markdown" || responseType === "youtube") &&
    !isError &&
    !imageResult &&
    resultText.trim().length > 0;
  const errorDescription = errorInfo?.summary
    ? `Failed · ${truncateText(errorInfo.summary, 20)}`
    : "Failed";

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const description = !result ? (
    <>
      <Loader2 className="h-3 w-3 animate-spin text-foreground" />
      <span>{isYoutubeMode ? "Fetching transcript..." : isImageMode ? "Fetching image..." : "Loading..."}</span>
    </>
  ) : isError ? (
    <>
      <X className="h-3 w-3 text-(--status-destructive)" />
      <span>{errorDescription}</span>
    </>
  ) : imageResult ? (
    <>
      <Check className="h-3 w-3 text-(--status-success)" />
      <span>
        {imageResult.source === "screenshot" ? "Screenshot" : "Image"} · {formatSize(imageResult.size_bytes)}
      </span>
    </>
  ) : (
    <>
      <Check className="h-3 w-3 text-(--status-success)" />
      <span>Success</span>
    </>
  );

  const cardIcon = isYoutubeMode ? (
    <Captions className="h-3.5 w-3.5" />
  ) : isImageMode ? (
    <ImageIcon className="h-3.5 w-3.5" />
  ) : (
    <Link className="h-3.5 w-3.5" />
  );

  const cardTitle = isYoutubeMode
    ? `Fetching transcript from ${url || "URL"}`
    : isImageMode
      ? imageResult?.source === "screenshot"
        ? `Screenshot of ${url || "URL"}`
        : `Fetching image from ${url || "URL"}`
      : `Fetching ${url || "URL"}`;

  const hasExpandableContent =
    imageResult || (isError && errorInfo) || hasMarkdownContent;
  const handleToggle = hasExpandableContent ? () => setIsExpanded((prev) => !prev) : undefined;

  const expandAction = hasExpandableContent ? (
    <ChevronDown
      className={cn(
        "h-3.5 w-3.5 text-(--text-tertiary) transition-transform duration-200",
        isExpanded && "rotate-180"
      )}
    />
  ) : null;

  return (
    <BaseResearchCard
      icon={cardIcon}
      title={cardTitle}
      description={description}
      action={expandAction}
      isActive={isActive}
      onClick={handleToggle}
    >
      {isExpanded && isError && errorInfo ? (
        <div className="pb-2 pl-9 pr-3 text-[11px] text-(--text-tertiary)">
          <div className="text-destructive/90">
            原因: {errorInfo.summary}
          </div>
          <div className="mt-1">建议: {errorInfo.suggestion}</div>
          {errorInfo.detail ? (
            <div className="mt-1 break-words text-[10px] text-(--text-tertiary)">
              详情: {truncateText(errorInfo.detail, 160)}
            </div>
          ) : null}
        </div>
      ) : null}
      {isExpanded && imageResult ? (
        <div className="pb-2 pl-9 pr-3">
          <ImagePreview
            url={imageResult.data_url}
            name={imageResult.source === "screenshot" ? "Webpage screenshot" : "Fetched image"}
            size={imageResult.size_bytes}
            className="max-h-48 w-auto rounded border border-border"
          />
        </div>
      ) : null}
      {isExpanded && hasMarkdownContent ? (
        <div className="pb-2 pl-9 pr-3">
          <div className="max-h-80 overflow-y-auto pr-1">
            <Markdown content={resultText} />
          </div>
        </div>
      ) : null}
    </BaseResearchCard>
  );
}
