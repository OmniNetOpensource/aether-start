import { Search, Link, Wrench } from "lucide-react";
import { useState } from "react";
import Markdown from "@/components/Markdown";
import {
  parseFetchClientPayload,
  parseSearchClientPayload,
  SEARCH_TOOL_NAMES,
  type SearchClientResult,
} from "@/lib/chat/search-result-payload";
import type { ResearchItem, Tool } from "@/types/message";
import type { StepStatus } from "@/components/ui/chain-of-thought";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
} from "@/components/ui/chain-of-thought";
import { getToolLifecycle, getSearchResultCount } from "./research-utils";

type SearchResultBadge = SearchClientResult;

// Parse search results to badge data
function parseSearchResults(rawResult: string): SearchResultBadge[] {
  return parseSearchClientPayload(rawResult)?.results.slice(0, 10) ?? [];
}

// Get step status from tool lifecycle
function getStepStatus(tool: Tool, isActive: boolean): StepStatus {
  const { result } = getToolLifecycle(tool);
  if (!result) {
    return isActive ? "active" : "pending";
  }
  return "complete";
}

// Get status text for a tool
function getStatusText(
  tool: Tool,
  isActive: boolean,
  toolName: string,
): string {
  const { result } = getToolLifecycle(tool);

  if (!result) {
    if (!isActive) return "等待中...";
    if (SEARCH_TOOL_NAMES.has(toolName)) return "搜索中...";
    if (toolName === "fetch_url") return "获取中...";
    return "执行中...";
  }

  const resultText = typeof result.result === "string" ? result.result : "";
  const isError =
    resultText.startsWith("Error") ||
    (resultText.startsWith("[系统提示:") &&
      (resultText.includes("内容过长") || resultText.includes("已省略不返回")));

  if (isError) {
    const errorSummary = resultText.startsWith("Error")
      ? resultText.replace(/^Error:\s*/, "").split("\n")[0]
      : "失败";
    return `失败 · ${errorSummary}`;
  }

  if (SEARCH_TOOL_NAMES.has(toolName)) {
    const count = getSearchResultCount(resultText);
    if (typeof count === "number") {
      return `完成 · ${count} 个结果`;
    }
  }

  return "完成";
}

// Favicon image component with fallback
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  } catch {
    return "";
  }
}

function Favicon({
  url,
  faviconDataUrl,
  fallback,
}: {
  url: string;
  faviconDataUrl?: string;
  fallback?: React.ReactNode;
}) {
  const [hasError, setHasError] = useState(false);
  const faviconSrc = faviconDataUrl || getFaviconUrl(url);

  if (!faviconSrc || hasError) return <>{fallback}</>;
  return (
    <img
      src={faviconSrc}
      alt=""
      className="h-4 w-4 rounded-sm"
      onError={() => setHasError(true)}
    />
  );
}

// Render a thinking step
function ThinkingStep({
  text,
  hideConnector,
}: {
  text: string;
  hideConnector: boolean;
}) {
  return (
    <ChainOfThoughtStep
      icon={<div className="h-2 w-2 rounded-full bg-current" />}
      hideConnector={hideConnector}
    >
      <div className="text-xs text-(--text-secondary) [&_p]:m-0">
        <Markdown content={text} />
      </div>
    </ChainOfThoughtStep>
  );
}

// Render a search tool step
function SearchStep({
  tool,
  isActive,
  hideConnector,
  stepKey,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
  stepKey: string;
}) {
  const args = tool.call.args as Record<string, unknown>;
  const query = typeof args.query === "string" ? args.query : "";
  const description = query ? `Reading the web · ${query}` : "Reading the web";

  const { result } = getToolLifecycle(tool);
  let searchResults: SearchResultBadge[] = [];
  if (result) {
    const resultText = typeof result.result === "string" ? result.result : "";
    searchResults = parseSearchResults(resultText);
  }

  return (
    <ChainOfThoughtStep
      icon={<Search className="h-full w-full" />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    >
      {searchResults.length > 0 && (
        <ChainOfThoughtSearchResults>
          {searchResults.map((r, i) => (
            <ChainOfThoughtSearchResult
              key={`${stepKey}-result-${i}`}
              href={r.url}
              icon={
                <Favicon
                  key={r.faviconDataUrl ?? getFaviconUrl(r.url)}
                  url={r.url}
                  faviconDataUrl={r.faviconDataUrl}
                  fallback={<Link className="h-4 w-4" />}
                />
              }
              url={r.url}
            >
              {r.title}
            </ChainOfThoughtSearchResult>
          ))}
        </ChainOfThoughtSearchResults>
      )}
    </ChainOfThoughtStep>
  );
}

// Parse image result from fetch tool
function parseFetchImageResult(tool: Tool): string | null {
  const { result } = getToolLifecycle(tool);
  if (!result) return null;
  try {
    const parsed = JSON.parse(result.result);
    if (parsed.type === "image" && typeof parsed.data_url === "string") {
      return parsed.data_url;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function getFetchFaviconDataUrl(tool: Tool): string | undefined {
  const { result } = getToolLifecycle(tool);
  if (!result) return undefined;

  const fetchPayload = parseFetchClientPayload(result.result);
  if (fetchPayload?.faviconDataUrl) {
    return fetchPayload.faviconDataUrl;
  }

  try {
    const parsed = JSON.parse(result.result);
    return typeof parsed?.faviconDataUrl === "string"
      ? parsed.faviconDataUrl
      : undefined;
  } catch {
    return undefined;
  }
}

// Render a fetch tool step
function FetchStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
}) {
  const args = tool.call.args as Record<string, unknown>;
  const url = typeof args.url === "string" ? args.url : "";
  const stepStatus = getStepStatus(tool, isActive);
  const imageDataUrl = parseFetchImageResult(tool);
  const faviconDataUrl = getFetchFaviconDataUrl(tool);

  const { result } = getToolLifecycle(tool);
  const resultText = result
    ? typeof result.result === "string"
      ? result.result
      : ""
    : "";
  const isError =
    result &&
    (resultText.startsWith("Error") ||
      (resultText.startsWith("[系统提示:") &&
        (resultText.includes("内容过长") ||
          resultText.includes("已省略不返回"))));

  const suffix =
    stepStatus === "complete" ? (isError ? "...failed." : "...done!") : "";
  const description = `Take a closer look${suffix}`;

  return (
    <ChainOfThoughtStep
      icon={
        <Favicon
          key={faviconDataUrl ?? getFaviconUrl(url)}
          url={url}
          faviconDataUrl={faviconDataUrl}
          fallback={<Link className="h-full w-full" />}
        />
      }
      description={description}
      status={stepStatus}
      hideConnector={hideConnector}
    >
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-(--interactive-primary-hover) transition-colors break-all"
        >
          {url}
        </a>
      )}
      {imageDataUrl && <ChainOfThoughtImage src={imageDataUrl} alt={url} />}
    </ChainOfThoughtStep>
  );
}

// Render a generic tool step
function GenericToolStep({
  tool,
  isActive,
  hideConnector,
}: {
  tool: Tool;
  isActive: boolean;
  hideConnector: boolean;
}) {
  const toolName = tool.call.tool;
  const status = getStatusText(tool, isActive, toolName);
  const description = `${toolName} · ${status}`;

  return (
    <ChainOfThoughtStep
      icon={<Wrench className="h-full w-full" />}
      description={description}
      status={getStepStatus(tool, isActive)}
      hideConnector={hideConnector}
    />
  );
}

type ResearchBlockProps = {
  items: ResearchItem[];
  blockIndex: number;
  messageIndex: number;
  isActive?: boolean;
};

export function ResearchBlock({
  items,
  blockIndex,
  messageIndex,
  isActive = false,
}: ResearchBlockProps) {
  return (
    <ChainOfThought>
      <ChainOfThoughtHeader>思考过程</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {items.map((item, index) => {
          const stepKey = `${messageIndex}-${blockIndex}-${index}`;
          const isLastStep = index === items.length - 1;

          if (item.kind === "thinking") {
            return (
              <ThinkingStep
                key={stepKey}
                text={item.text}
                hideConnector={isLastStep}
              />
            );
          }

          const tool = item.data;
          const toolName = tool.call.tool;
          const isLastItem = index === items.length - 1;
          const itemIsActive = isActive && isLastItem;

          if (SEARCH_TOOL_NAMES.has(toolName)) {
            return (
              <SearchStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
                stepKey={stepKey}
              />
            );
          }

          if (toolName === "fetch_url") {
            return (
              <FetchStep
                key={stepKey}
                tool={tool}
                isActive={itemIsActive}
                hideConnector={isLastStep}
              />
            );
          }

          return (
            <GenericToolStep
              key={stepKey}
              tool={tool}
              isActive={itemIsActive}
              hideConnector={isLastStep}
            />
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
