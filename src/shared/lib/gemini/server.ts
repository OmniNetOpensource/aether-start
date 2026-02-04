import type { GeminiContent } from "./converter";

export type GeminiStreamChunk = {
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

const getConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const baseUrl = process.env.GEMINI_BASE_URL || "https://www.right.codes/gemini";
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
};

export async function* streamGeminiContent(params: {
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
}): AsyncGenerator<GeminiStreamChunk> {
  const { apiKey, baseUrl } = getConfig();

  const requestBody: Record<string, unknown> = {
    contents: params.contents,
  };

  if (params.systemInstruction && params.systemInstruction.trim().length > 0) {
    requestBody.system_instruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  const response = await fetch(
    `${baseUrl}/v1beta/models/${encodeURIComponent(
      params.model
    )}:streamGenerateContent?alt=sse`,
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
