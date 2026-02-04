import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResearchItem } from "@/src/features/chat/types/chat";
import { ResearchBlock } from "./ResearchBlock";

type ToolItem = Extract<ResearchItem, { kind: "tool" }>;

const makeToolItem = (tool: string, query = "legacy query"): ToolItem => ({
  kind: "tool",
  data: {
    call: {
      tool,
      args: { query },
    },
  },
});

describe("ResearchBlock legacy search tools", () => {
  it.each([
    "serper_search",
    "tavily_search",
    "serp_search",
    "brave_search",
  ])("renders SearchCard for legacy tool %s", (toolName) => {
    render(
      <ResearchBlock
        items={[makeToolItem(toolName)]}
        blockIndex={0}
        messageIndex={0}
      />
    );

    expect(screen.getByText("Searching: legacy query")).toBeTruthy();
    expect(screen.queryByText(`Running ${toolName}`)).toBeNull();
  });

  it("keeps unknown tools on UnknownToolCard", () => {
    render(
      <ResearchBlock
        items={[makeToolItem("custom_tool")]}
        blockIndex={0}
        messageIndex={0}
      />
    );

    expect(screen.getByText("Running custom_tool")).toBeTruthy();
  });
});
