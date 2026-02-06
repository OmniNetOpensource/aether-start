import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";
import type { SerializedMessage } from "@/src/features/chat/types/chat";
import {
  getAnthropicConfig,
} from "@/src/providers/config";

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

        let anthropicConfig: ReturnType<typeof getAnthropicConfig>;
        try {
          anthropicConfig = getAnthropicConfig();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Missing ANTHROPIC_API_KEY";
          return Response.json({ error: message }, { status: 500 });
        }
        const titleModel = "claude-haiku-4-5";

        const promptLines = [
          "Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.",
          userText ? `User: ${userText}` : "",
          `Assistant: ${assistantText}`,
        ].filter((line) => line.length > 0);

        const prompt = promptLines.join("\n");

        const client = new Anthropic({
          apiKey: anthropicConfig.apiKey,
          baseURL: anthropicConfig.baseURL,
          defaultHeaders: anthropicConfig.defaultHeaders,
        });

        let rawTitle = "";
        try {
          const response = await client.messages.create({
            model: titleModel,
            max_tokens: 64,
            temperature: 0.2,
            messages: [{ role: "user", content: prompt }],
          });
          rawTitle = Array.isArray(response.content)
            ? response.content
                .map((block) => (block.type === "text" ? block.text : ""))
                .join("")
            : "";
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error("Title generation failed:", message);
          return Response.json(
            { error: "Title generation failed" },
            { status: 502 },
          );
        }

        const title = typeof rawTitle === "string" ? sanitizeTitle(rawTitle) : "";

        if (!title) {
          return Response.json({ title: FALLBACK_TITLE });
        }

        return Response.json({ title });
      },
    },
  },
});
