import type {
  Tool,
  ToolResult,
} from "@/types/message";

export function getToolLifecycle(tool: Tool): {
  result?: ToolResult;
} {
  return {
    result: tool.result,
  };
}

export function getSearchResultCount(rawResult: string): number | null {
  try {
    const data = JSON.parse(rawResult) as {
      results?: unknown;
      rawResults?: unknown;
      web?: { results?: unknown };
    };
    const rawResults =
      (Array.isArray(data?.results) && data.results) ||
      (Array.isArray(data?.rawResults) && data.rawResults) ||
      (Array.isArray(data?.web?.results) && data.web.results) ||
      [];

    if (!Array.isArray(rawResults)) {
      return null;
    }

    return rawResults.filter((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const url =
        "url" in item && typeof item.url === "string"
          ? item.url
          : "link" in item && typeof item.link === "string"
            ? item.link
            : "";
      return Boolean(url);
    }).length;
  } catch {
    return null;
  }
}
