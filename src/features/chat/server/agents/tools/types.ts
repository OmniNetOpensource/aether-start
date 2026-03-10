export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolHandler = (
  args: unknown,
  signal?: AbortSignal,
) => Promise<string>;

export type ToolDefinition = {
  spec: ChatTool;
  handler: ToolHandler;
};
