import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicMessage, AnthropicTool } from "./converter";

export type AnthropicStreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_delta"; partial_json: string }
  | { type: "stop"; stop_reason: string };

const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    defaultHeaders: {
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    },
  });
};

export async function* streamAnthropicCompletion(params: {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
}): AsyncGenerator<AnthropicStreamChunk> {
  const client = getClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamParams: any = {
    model: params.model,
    messages: params.messages as Anthropic.MessageParam[],
    system: params.system,
    tools: params.tools as Anthropic.Tool[],
    max_tokens: 64000,
    thinking: {
      type: "enabled",
      budget_tokens: 51404,
    },
  };

  const stream = client.messages.stream(streamParams);

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "tool_use") {
        yield {
          type: "tool_use_start",
          id: event.content_block.id,
          name: event.content_block.name,
        };
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      } else if (event.delta.type === "input_json_delta") {
        yield { type: "tool_use_delta", partial_json: event.delta.partial_json };
      } else if (event.delta.type === "thinking_delta") {
        yield { type: "thinking", thinking: (event.delta as { type: "thinking_delta"; thinking: string }).thinking };
      }
    } else if (event.type === "message_delta") {
      if (event.delta.stop_reason) {
        yield { type: "stop", stop_reason: event.delta.stop_reason };
      }
    }
  }
}
