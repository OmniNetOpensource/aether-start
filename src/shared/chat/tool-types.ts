export type FetchProvider = 'jina' | 'firecrawl' | 'exa';

export type ToolContext = {
  fetchProvider?: FetchProvider;
};

export type ChatTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolHandler = (
  args: unknown,
  signal?: AbortSignal,
  context?: ToolContext,
) => Promise<string>;

export type ToolDefinition = {
  spec: ChatTool;
  handler: ToolHandler;
};
