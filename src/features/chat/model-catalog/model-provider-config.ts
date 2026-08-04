export type ChatFormat = 'anthropic' | 'openai' | 'gemini' | 'openai-responses';
export type ChatBackend =
  | 'moonshot'
  | 'ikun'
  | 'openrouter'
  | 'gemini-aistudio';

export const IKUN_BASE_URL = 'https://api.ikuncode.cc';

export type ModelConfig = {
  id: string;
  name: string;
  model: string;
  format: ChatFormat;
  backend: ChatBackend;
};

type ModelDefinition = {
  id: string;
  name: string;
  model: string;
  backend: ChatBackend;
};

export type PromptConfig = {
  id: string;
  name: string;
  content: string;
};

const englishTeacherSystemPrompt = `你是一位英语教学助手。我会给你发送一段英文内容（可能较长）。你需要逐句分析，不得省略任何句子。
对于每一句话，按照以下结构进行讲解：

1. **整句意思**：解释这句话的整体含义
2. **重点词汇与表达**：挑出并解释重要的单词、短语或习惯用法，包括：
   - 词义和用法
   - 语义细微差别
   - 常见搭配

关键要求：
- 必须分析每一句话，不要跳过或概括
- 如果文本有多个段落，系统性地逐段处理
- 讲解要清晰易懂，必要时提供例句

请等待我提供英文文本。`;

const aetherSystemPrompt = `
如果需要搜索，非必要情况下不要用中文搜索；在没有足够上下文之前不要回答；如果没有搞清楚，就不断调研直到搞清楚；如果需要搜索，则尽可能引用一手资料；确保清楚理解我的意图之后再开始行动；你要确保你讲的东西我能听得懂；

请用朴实、平静、耐心的语言回答我的问题，就像一个有经验的朋友在认真地帮我理解一个话题。语气要温和、鼓励，让人感到你愿意花时间把事情讲清楚。不要使用夸张的形容词和营销式的表达，比如"非常棒"、"超级强大"这类词，而是具体说明实际情况就好。

回答时请关注底层原理和运作机制，不只是停留在表面现象。重点说明"为什么"和"怎么做到的"，而不只是"是什么"。涉及具体机制时，说明内部是如何运作的、各个环节如何衔接、过程中发生了什么变化。

在解释复杂概念时，请从最基础的部分讲起，一步步引导到深层内容。如果某个概念需要先理解一些背景知识或相关话题，可以稍微展开解释一下，帮助建立完整认知框架，确保理解的连贯性。把整个话题拆分成容易消化的小步骤，让人能跟上思路。

请主动预见可能产生歧义或困惑的地方，在讲到这些点时停下来做个说明。比如某个术语有多种含义，或者某个步骤容易被误解，就提前澄清。用具体例子和场景来说明抽象概念，指出新手常见的误区和容易忽略的细节。可以适当使用类比，但要确保类比准确，不要为了简化而丢失关键信息。

默认使用完整句子与成段表述；少使用要点式列表。

用地道的中文表达，注意不要有翻译味道`;

const PROMPT_CONFIGS: Record<string, PromptConfig> = {
  aether: {
    id: 'aether',
    name: 'aether',
    content: aetherSystemPrompt,
  },
  englishTeacher: {
    id: 'englishTeacher',
    name: '英语教学助手',
    content: englishTeacherSystemPrompt,
  },
};

export const DEFAULT_MODEL_ID = 'claudeOpus46Ikun';
export const DEFAULT_MODEL_INFO = {
  id: DEFAULT_MODEL_ID,
  name: 'opus-4-6+ikun',
};

const DEFAULT_MODEL: ModelDefinition = {
  ...DEFAULT_MODEL_INFO,
  model: 'claude-opus-4-6',
  backend: 'ikun',
};

export const createModelId = (backend: ChatBackend, model: string) => `${backend}:${model}`;

export const getModelConfig = (modelId: string): ModelConfig | null => {
  const id = modelId.trim();
  let modelConfig: ModelDefinition;

  if (id === DEFAULT_MODEL_ID) {
    modelConfig = DEFAULT_MODEL;
  } else {
    const separatorIndex = id.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === id.length - 1) {
      return null;
    }

    const backend = id.slice(0, separatorIndex);
    if (
      backend !== 'ikun' &&
      backend !== 'gemini-aistudio' &&
      backend !== 'moonshot' &&
      backend !== 'openrouter'
    ) {
      return null;
    }

    const model = id.slice(separatorIndex + 1);
    modelConfig = { id, name: model, model, backend };
  }

  if (modelConfig.backend === 'ikun') {
    if (modelConfig.model.startsWith('claude-')) {
      return { ...modelConfig, format: 'anthropic' };
    }
    if (modelConfig.model.startsWith('gemini-')) {
      return { ...modelConfig, format: 'gemini' };
    }
    if (modelConfig.model.startsWith('gpt-')) {
      return { ...modelConfig, format: 'openai-responses' };
    }
    throw new Error(`Unknown ikun model protocol: ${modelConfig.model}`);
  }

  return {
    ...modelConfig,
    format: modelConfig.backend === 'gemini-aistudio' ? 'gemini' : 'openai',
  };
};

export const getDefaultModelConfig = (): ModelConfig => ({
  ...DEFAULT_MODEL,
  format: 'anthropic',
});

export const getAvailablePrompts = (): { id: string; name: string }[] =>
  Object.values(PROMPT_CONFIGS).map(({ id, name }) => ({ id, name }));

export const getPromptById = (promptId: string): PromptConfig | null => {
  const id = promptId.trim();
  return (
    PROMPT_CONFIGS[id] ??
    Object.values(PROMPT_CONFIGS).find((p) => p.id === id || p.name === id) ??
    null
  );
};

export const getDefaultPromptId = (): string => 'aether';

/** Model ID used for conversation title generation. */
export const TITLE_GENERATION_MODEL_ID = createModelId('ikun', 'claude-haiku-4-5-20251001');
