"use client";

import { Check, Link, Loader2, X } from "lucide-react";
import type { ResearchItem } from "@/src/features/chat/types/chat";
import { BaseResearchCard } from "./BaseResearchCard";
import { getToolLifecycle, tryGetHostname } from "../utils";

type FetchUrlCardProps = {
  item: Extract<ResearchItem, { kind: "tool" }>;
  isActive?: boolean;
};

export function FetchUrlCard({ item, isActive = false }: FetchUrlCardProps) {
  const tool = item.data;
  const { result } = getToolLifecycle(tool);
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === "string" ? args.url : "";
  const hostname = url ? tryGetHostname(url) : "URL";
  const resultText = typeof result?.result === "string" ? result.result : "";
  const isSystemPromptTooLong =
    resultText.startsWith("[系统提示:") &&
    (resultText.includes("内容过长") || resultText.includes("已省略不返回"));
  const isError = resultText.startsWith("Error") || isSystemPromptTooLong;

  const description = !result ? (
    <>
      <Loader2 className="h-3 w-3 animate-spin text-foreground" />
      <span>Loading...</span>
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

  return (
    <BaseResearchCard
      icon={<Link className="h-3.5 w-3.5" />}
      title={`Fetching ${hostname}`}
      description={description}
      action={null}
      isActive={isActive}
      onClick={undefined}
      buttonProps={{
        "aria-disabled": true,
      }}
    />
  );
}
