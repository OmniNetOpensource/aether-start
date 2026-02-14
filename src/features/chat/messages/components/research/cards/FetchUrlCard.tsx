"use client";

import { Captions, Check, Image as ImageIcon, Link, Loader2, X } from "lucide-react";
import type { ResearchItem } from "@/features/chat/types/chat";
import { BaseResearchCard } from "./BaseResearchCard";
import { getToolLifecycle } from "../utils";

type FetchUrlCardProps = {
  item: Extract<ResearchItem, { kind: "tool" }>;
  isActive?: boolean;
};

export function FetchUrlCard({ item, isActive = false }: FetchUrlCardProps) {
  const tool = item.data;
  const { result } = getToolLifecycle(tool);
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === "string" ? args.url : "";
  const responseType = typeof args.response_type === "string" ? args.response_type : "markdown";
  const resultText = typeof result?.result === "string" ? result.result : "";

  const isImageMode = responseType === "image";
  const isYoutubeMode = responseType === "youtube";

  const isSystemPromptTooLong =
    resultText.startsWith("[系统提示:") &&
    (resultText.includes("内容过长") || resultText.includes("已省略不返回"));
  const isError = resultText.startsWith("Error") || isSystemPromptTooLong;

  const description = !result ? (
    <>
      <Loader2 className="h-3 w-3 animate-spin text-(--text-primary)" />
      <span>{isYoutubeMode ? "Fetching transcript..." : isImageMode ? "Fetching image..." : "Loading..."}</span>
    </>
  ) : isError ? (
    <>
      <X className="h-3 w-3 text-(--status-destructive)" />
      <span>Failed</span>
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
      ? `Fetching image from ${url || "URL"}`
      : `Fetching ${url || "URL"}`;

  return (
    <BaseResearchCard
      icon={cardIcon}
      title={cardTitle}
      description={description}
      isActive={isActive}
    />
  );
}
