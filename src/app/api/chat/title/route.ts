import { createFileRoute } from "@tanstack/react-router";
import type { SerializedMessage } from "@/src/features/chat/types/chat";
import {
  OPENROUTER_BASE_URL,
  getOpenRouterHeaders,
} from "@/src/providers/config";

const TITLE_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_TITLE = "New Chat";

const extractContent = (message?: SerializedMessage) => {
  if (!message?.blocks) {
    return "";
  }

  return message.blocks
    .filter((block) => block.type === "content")
    .map((block) => block.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const sanitizeTitle = (value: string) => {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const Route = createFileRoute("/api/chat/title")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { messages?: SerializedMessage[] };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const { messages } = body ?? {};
        if (!Array.isArray(messages)) {
          return Response.json({ error: "Missing messages" }, { status: 400 });
        }

        const userMessage = messages.find((message) => message?.role === "user");
        const assistantMessage = messages.find(
          (message) => message?.role === "assistant",
        );
        const userText = extractContent(userMessage);
        const assistantText = extractContent(assistantMessage);

        if (!assistantText) {
          return Response.json({ title: FALLBACK_TITLE });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "Missing OPENROUTER_API_KEY" },
            { status: 500 },
          );
        }

        const promptLines = [
          "Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.",
          userText ? `User: ${userText}` : "",
          `Assistant: ${assistantText}`,
        ].filter((line) => line.length > 0);

        const prompt = promptLines.join("\n");

        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...getOpenRouterHeaders(),
          },
          body: JSON.stringify({
            model: TITLE_MODEL,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 50,
            temperature: 0.2,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Title generation failed:", response.status, errorText);
          return Response.json(
            { error: "Title generation failed" },
            { status: 502 },
          );
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawTitle = data?.choices?.[0]?.message?.content;
        const title = typeof rawTitle === "string" ? sanitizeTitle(rawTitle) : "";

        if (!title) {
          return Response.json({ title: FALLBACK_TITLE });
        }

        return Response.json({ title });
      },
    },
  },
});
