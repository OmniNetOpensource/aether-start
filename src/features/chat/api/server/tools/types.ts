export type ToolName =
  | "fetch_url"
  | "search";

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolProgressUpdate = {
  stage: string;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
};

export type ToolProgressCallback = (
  progress: ToolProgressUpdate
) => void | Promise<void>;

export type ToolHandler = (
  args: unknown,
  onProgress?: ToolProgressCallback,
  signal?: AbortSignal,
) => Promise<string>;

export type ToolDefinition = {
  spec: ChatTool;
  handler: ToolHandler;
};

export const cleanHtmlToText = (html: string) =>
  html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
