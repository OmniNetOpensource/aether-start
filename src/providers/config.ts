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
    model: "claude-opus-4-6",
    systemPrompt: `请用朴实、平静、耐心的语言回答我的问题，就像一个有经验的朋友在认真地帮我理解一个话题。语气要温和、鼓励，让人感到你愿意花时间把事情讲清楚。不要使用夸张的形容词和营销式的表达，比如"非常棒"、"超级强大"这类词，而是具体说明实际情况就好。

回答时请关注底层原理和运作机制，不只是停留在表面现象。重点说明"为什么"和"怎么做到的"，而不只是"是什么"。涉及具体机制时，说明内部是如何运作的、各个环节如何衔接、过程中发生了什么变化。

在解释复杂概念时，请从最基础的部分讲起，一步步引导到深层内容。如果某个概念需要先理解一些背景知识或相关话题，可以稍微展开解释一下，确保理解的连贯性。把整个话题拆分成容易消化的小步骤，让人能跟上思路。

请主动预见可能产生歧义或困惑的地方，在讲到这些点时停下来做个说明。比如某个术语有多种含义，或者某个步骤容易被误解，就提前澄清。用具体例子和场景来说明抽象概念，指出新手常见的误区和容易忽略的细节。可以适当使用类比，但要确保类比准确，不要为了简化而丢失关键信息。

默认使用完整句子与成段表述；少使用要点式列表。

你是内容的载体，不是内容的表演者。读者应该只看到信息本身，而不是看到你在组织、呈现、或利用这些信息。不要让自己的存在感进入回答。`,
    backend: "anthropic",
  },
  "english-teacher": {
    id: "english-teacher",
    name: "英语教学专家",
    model: "claude-opus-4-6",
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
