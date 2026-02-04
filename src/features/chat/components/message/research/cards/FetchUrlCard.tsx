"use client";

import { Check, Link, Loader2, X } from "lucide-react";
import type { ResearchItem } from "@/src/features/chat/types/chat";
import { BaseResearchCard } from "./BaseResearchCard";
import { getToolLifecycle } from "../utils";

type FetchUrlCardProps = {
  item: Extract<ResearchItem, { kind: "tool" }>;
  isActive?: boolean;
};

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
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
  const tool = item.data;
  const { result } = getToolLifecycle(tool);
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === "string" ? args.url : "";
  const resultText = typeof result?.result === "string" ? result.result : "";
  const isSystemPromptTooLong =
    resultText.startsWith("[系统提示:") &&
    (resultText.includes("内容过长") || resultText.includes("已省略不返回"));
  const isError = resultText.startsWith("Error") || isSystemPromptTooLong;
  const errorInfo = isError ? parseFetchError(resultText) : null;
  const errorDescription = errorInfo?.summary
    ? `Failed · ${truncateText(errorInfo.summary, 20)}`
    : "Failed";

  const description = !result ? (
    <>
      <Loader2 className="h-3 w-3 animate-spin text-foreground" />
      <span>Loading...</span>
    </>
  ) : isError ? (
    <>
      <X className="h-3 w-3 text-(--status-destructive)" />
      <span>{errorDescription}</span>
    </>
  ) : (
    <>
      <Check className="h-3 w-3 text-(--status-success)" />
      <span>Success</span>
    </>
  );

  return (
    <BaseResearchCard
      icon={<Link className="h-3.5 w-3.5" />}
      title={`Fetching ${url || "URL"}`}
      description={description}
      action={null}
      isActive={isActive}
      onClick={undefined}
      buttonProps={{
        "aria-disabled": true,
      }}
    >
      {isError && errorInfo ? (
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
    </BaseResearchCard>
  );
}
