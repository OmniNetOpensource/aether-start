import type { SerializedMessage } from "@/src/features/chat/types/chat";
import type { ChatTool } from "@/src/shared/lib/tools/types";

type AnthropicImageSource = {
  type: "base64";
  media_type: string;
  data: string;
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export function convertToAnthropicMessages(
  history: SerializedMessage[]
): AnthropicMessage[] {
  return history.map((msg) => {
    const contentBlocks: AnthropicContentBlock[] = [];

    for (const block of msg.blocks) {
      if (block.type === "content" && block.content) {
        contentBlocks.push({ type: "text", text: block.content });
      } else if (block.type === "attachments") {
        for (const att of block.attachments) {
          if (att.kind === "image" && att.url) {
            const base64Match = att.url.match(/^data:([^;]+);base64,(.+)$/);
            if (base64Match) {
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: base64Match[1],
                  data: base64Match[2],
                },
              });
            }
          }
        }
      }
    }

    return {
      role: msg.role,
      content: contentBlocks.length > 0 ? contentBlocks : "",
    };
  });
}

export function convertToolsToAnthropic(tools: ChatTool[]): AnthropicTool[] {
  return tools
    .filter((t) => t.type === "function")
    .map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Record<string, unknown>,
    }));
}
