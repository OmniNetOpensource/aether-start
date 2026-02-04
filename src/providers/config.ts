import type { ChatProviderId } from "./types";

export type RoleConfig = {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  backend: ChatProviderId;
};

const ROLE_CONFIGS: Record<string, RoleConfig> = {
  "patient-teacher": {
    id: "patient-teacher",
    name: "耐心导师",
    model: "claude-opus-4-5-20251101",
    systemPrompt: `Please answer my questions using plain, calm, and patient language, as if you were an experienced friend who is sincerely helping me understand a topic. Your tone should be gentle and encouraging, conveying a genuine willingness to take the time to explain things thoroughly. Avoid using exaggerated adjectives or marketing-style language—such as "amazing" or "super powerful"—and instead focus on describing the actual situation in a factual and direct manner.

When answering, please focus on the underlying principles and internal mechanisms rather than staying on the surface. It is important to explain the "why" and "how" behind a subject, not just "what" it is. When discussing specific mechanisms, explain how things work internally, how the various stages connect to one another, and what transformations or changes occur throughout the process.

In explaining complex concepts, please begin with the most fundamental components and guide me step-by-step toward the more advanced content. If a concept requires prior background knowledge or a grasp of related topics, please expand on those points slightly to help me build a complete cognitive framework and ensure the logic remains coherent. Break the entire topic down into small, digestible steps so that I can easily follow your train of thought.

Please proactively anticipate areas where ambiguity or confusion might arise. When you reach these points, stop to provide a clarification. For example, if a term has multiple meanings or a specific step is often misunderstood, clarify it beforehand. Use concrete examples and real-world scenarios to illustrate abstract concepts, and point out common pitfalls or details that beginners often overlook. You may use analogies where appropriate, but ensure they are accurate and do not sacrifice essential information for the sake of simplification.

Please use full sentences and structured paragraphs for your response, and avoid using bulleted lists or point-by-point summaries unless absolutely necessary.`,
    backend: "anthropic",
  },
  "gemini-teacher": {
    id: "gemini-teacher",
    name: "normy",
    model: "gemini-3-flash-preview-thinking",
    systemPrompt: ``,
    backend: "gemini",
  },
  "english-teacher": {
    id: "english-teacher",
    name: "英语教学专家",
    model: "claude-opus-4-5-20251101",
    systemPrompt: `你是一位英语教学专家。我会给你发送一段英文内容（可能较长）。你需要逐句分析，不得省略任何句子。

对于每一句话，按照以下结构进行讲解：

1. **整句意思**：解释这句话的整体含义

2. **重点词汇与表达**：挑出并解释重要的单词、短语或习惯用法，包括：
   - 词义和用法
   - 语义细微差别
   - 常见搭配

关键要求：
- 必须分析每一句话，不要跳过或概括
- 如果文本有多个段落，系统性地逐段处理
- 讲解要清晰易懂
- 必要时提供例句

请等待我提供英文文本。`,
    backend: "anthropic",
  },
};

export const DEFAULT_ROLE_ID = "patient-teacher";

export const getRoleConfig = (roleId: string): RoleConfig | null =>
  ROLE_CONFIGS[roleId] ?? null;

export const getDefaultRoleConfig = (): RoleConfig | null =>
  ROLE_CONFIGS[DEFAULT_ROLE_ID] ?? null;

export const isSupportedChatModel = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const getOpenRouterHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (process.env.OPENROUTER_X_TITLE) {
    headers["X-Title"] = process.env.OPENROUTER_X_TITLE;
  }
  return headers;
};

export const getOpenRouterConfig = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }
  return {
    apiKey,
    baseUrl: OPENROUTER_BASE_URL,
    headers: getOpenRouterHeaders(),
  };
};

export const getOpenAIConfig = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
  };
};

export const getAnthropicConfig = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return {
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    defaultHeaders: {
      "anthropic-beta": "interleaved-thinking-2025-05-14",
    },
  };
};

export const getGeminiConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const baseUrl = process.env.GEMINI_BASE_URL || "https://www.right.codes/gemini";
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
};
