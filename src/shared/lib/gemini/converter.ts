import type { SerializedMessage } from "@/src/features/chat/types/chat";

export type GeminiContentPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiContentPart[];
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
