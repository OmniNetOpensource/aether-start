import { buildSystemPrompt } from "@/src/server/chat/utils";
import { getGeminiConfig } from "./config";
import type { ChatOptions, ChatResult, ChatState, StreamEvent, ToolCallResult } from "./types";
import type { SerializedMessage } from "@/src/features/chat/types/chat";

export type GeminiContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiContentPart[];
};

type GeminiStreamChunk = {
  text: string;
};

type GeminiStreamResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inline_data?: { mime_type?: string; data?: string };
      }>;
    };
  }>;
};

type GeminiState = {
  contents: GeminiContent[];
  systemInstruction: string;
};

const parseDataUrl = (value: string): { mimeType: string; data: string } | null => {
  if (!value.startsWith("data:")) {
    return null;
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }

  const meta = value.slice("data:".length, commaIndex);
  const data = value.slice(commaIndex + 1);
  if (!data) {
    return null;
  }

  const mimeType = meta.split(";")[0] || "application/octet-stream";
  return { mimeType, data };
};

export function convertToGeminiContents(history: SerializedMessage[]): GeminiContent[] {
  return history
    .map((msg) => {
      const parts: GeminiContentPart[] = [];

      for (const block of msg.blocks) {
        if (block.type === "content" && block.content) {
          parts.push({ text: block.content });
        } else if (block.type === "attachments") {
          for (const attachment of block.attachments) {
            if (attachment.kind !== "image" || !attachment.url) {
              continue;
            }

            const parsed = parseDataUrl(attachment.url);
            if (!parsed) {
              continue;
            }

            parts.push({
              inline_data: {
                mime_type: parsed.mimeType,
                data: parsed.data,
              },
            });
          }
        }
      }

      if (parts.length === 0) {
        return null;
      }

      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts,
      } satisfies GeminiContent;
    })
    .filter((content): content is GeminiContent => Boolean(content));
}

export async function* streamGeminiContent(params: {
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
}): AsyncGenerator<GeminiStreamChunk> {
  const { apiKey, baseUrl } = getGeminiConfig();

  const requestBody: Record<string, unknown> = {
    contents: params.contents,
  };

  if (params.systemInstruction && params.systemInstruction.trim().length > 0) {
    requestBody.system_instruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  const response = await fetch(
    `${baseUrl}/v1beta/models/${encodeURIComponent(params.model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Gemini API returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") {
        continue;
      }

      let payload: GeminiStreamResponse | null = null;
      try {
        payload = JSON.parse(data) as GeminiStreamResponse;
      } catch {
        continue;
      }

      const parts = payload?.candidates?.[0]?.content?.parts;
      if (!parts || parts.length === 0) {
        continue;
      }

      for (const part of parts) {
        if (typeof part.text === "string" && part.text.length > 0) {
          yield { text: part.text };
        }
      }
    }
  }
}

const createInitialState = (options: ChatOptions): GeminiState => {
  const basePrompt = buildSystemPrompt();
  const rolePrompt = options.systemPrompt?.trim();
  const systemInstruction = rolePrompt ? `${basePrompt}\n\n${rolePrompt}` : basePrompt;

  return {
    contents: convertToGeminiContents(options.messages),
    systemInstruction,
  };
};

const toChatState = (state: GeminiState): ChatState => ({
  backend: "gemini",
  data: state,
});

export async function* runGeminiChat(
  options: ChatOptions,
  state?: ChatState
): AsyncGenerator<StreamEvent, ChatResult> {
  const workingState = state && state.backend === "gemini"
    ? (state.data as GeminiState)
    : createInitialState(options);

  let assistantText = "";

  try {
    for await (const chunk of streamGeminiContent({
      model: options.model,
      contents: workingState.contents,
      systemInstruction: workingState.systemInstruction,
    })) {
      assistantText += chunk.text;
      yield { type: "content", content: chunk.text };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Gemini completion";
    const model = options?.model ?? "unknown";
    yield { type: "error", message: `错误：Gemini 请求失败 (model=${model}): ${message}` };
    return { shouldContinue: false, pendingToolCalls: [], assistantText: "", state: toChatState(workingState) };
  }

  return { shouldContinue: false, pendingToolCalls: [], assistantText, state: toChatState(workingState) };
}

export async function* continueGeminiChat(
  options: ChatOptions,
  state: ChatState,
  toolResults: ToolCallResult[]
): AsyncGenerator<StreamEvent, ChatResult> {
  if (state.backend !== "gemini") {
    throw new Error("Invalid gemini state");
  }
  void toolResults;
  return yield* runGeminiChat(options, state);
}
