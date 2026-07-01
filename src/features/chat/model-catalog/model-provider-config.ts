export type ChatFormat = 'anthropic' | 'openai' | 'gemini' | 'openai-responses';
export type ChatBackend =
  | 'rightcode-claude'
  | 'rightcode-claude-sale'
  | 'rightcode-gemini'
  | 'rightcode-openai'
  | 'moonshot'
  | 'dmx'
  | 'ikun'
  | 'ikun-openai'
  | 'ikun-gemini'
  | 'openrouter'
  | 'cubence-claude'
  | 'cubence-gemini'
  | 'cubence-openai'
  | 'gemini-aistudio';

export type ModelConfig = {
  id: string;
  name: string;
  model: string;
  format: ChatFormat;
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

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  claudeOpus46Ikun: {
    id: 'claudeOpus46Ikun',
    name: 'opus-4-6+ikun',
    model: 'claude-opus-4-6',
    format: 'anthropic',
    backend: 'ikun',
  },
  claudeOpus47Ikun: {
    id: 'claudeOpus47Ikun',
    name: 'opus-4-7+ikun',
    model: 'claude-opus-4-7',
    format: 'anthropic',
    backend: 'ikun',
  },
  claudeOpus48Ikun: {
    id: 'claudeOpus48Ikun',
    name: 'opus-4-8+ikun',
    model: 'claude-opus-4-8',
    format: 'anthropic',
    backend: 'ikun',
  },
  claudeOpus45Ikun: {
    id: 'claudeOpus45Ikun',
    name: 'opus-4-5+ikun',
    model: 'claude-opus-4-5-20251101',
    format: 'anthropic',
    backend: 'ikun',
  },
  test3: {
    id: 'test3',
    name: 'qwen3.5-plus+dmx',
    model: 'qwen3.5-plus',
    format: 'openai',
    backend: 'dmx',
  },
  qwen35PlusFree: {
    id: 'qwen35PlusFree',
    name: 'qwen3.5-plus-free+dmx',
    model: 'qwen3.5-plus-free',
    format: 'openai',
    backend: 'dmx',
  },
  minimaxM25: {
    id: 'minimaxM25',
    name: 'MiniMax-M2.5+dmx',
    model: 'MiniMax-M2.5',
    format: 'openai',
    backend: 'dmx',
  },
  minimaxM27: {
    id: 'minimaxM27',
    name: 'MiniMax-M2.7+dmx',
    model: 'MiniMax-M2.7',
    format: 'openai',
    backend: 'dmx',
  },
  minimaxM27Free: {
    id: 'minimaxM27Free',
    name: 'MiniMax-M2.7-free+dmx',
    model: 'MiniMax-M2.7-free',
    format: 'openai',
    backend: 'dmx',
  },
  glm5: {
    id: 'glm5',
    name: 'glm-5+dmx',
    model: 'glm-5',
    format: 'openai',
    backend: 'dmx',
  },
  glm5Free: {
    id: 'glm5Free',
    name: 'glm-5-free+dmx',
    model: 'glm-5-free',
    format: 'openai',
    backend: 'dmx',
  },
  glm5TurboFree: {
    id: 'glm5TurboFree',
    name: 'glm-5-turbo-free+dmx',
    model: 'glm-5-turbo-free',
    format: 'openai',
    backend: 'dmx',
  },
  glm51Free: {
    id: 'glm51Free',
    name: 'glm-5.1-free+dmx',
    model: 'glm-5.1-free',
    format: 'openai',
    backend: 'dmx',
  },
  doubao: {
    id: 'doubao',
    name: 'doubao-seed-2-0-pro-260215+dmx',
    model: 'doubao-seed-2-0-pro-260215',
    format: 'openai',
    backend: 'dmx',
  },
  doubaoSeed20ProFree: {
    id: 'doubaoSeed20ProFree',
    name: 'doubao-seed-2.0-pro-free+dmx',
    model: 'doubao-seed-2.0-pro-free',
    format: 'openai',
    backend: 'dmx',
  },
  kimiK25: {
    id: 'kimiK25',
    name: 'kimi-k2.5+dmx',
    model: 'kimi-k2.5',
    format: 'openai',
    backend: 'dmx',
  },
  kimiK25Free: {
    id: 'kimiK25Free',
    name: 'kimi-k2.5-free+dmx',
    model: 'kimi-k2.5-free',
    format: 'openai',
    backend: 'dmx',
  },
  deepseekV32: {
    id: 'deepseekV32',
    name: 'DeepSeek-V3.2-Thinking+dmx',
    model: 'DeepSeek-V3.2-Thinking',
    format: 'openai',
    backend: 'dmx',
  },
  claudeOpus47CcDmx: {
    id: 'claudeOpus47CcDmx',
    name: 'claude-opus-4-7-cc+dmx',
    model: 'claude-opus-4-7-cc',
    format: 'openai',
    backend: 'dmx',
  },
  claudeOpus47Dmx: {
    id: 'claudeOpus47Dmx',
    name: 'claude-opus-4-7+dmx',
    model: 'claude-opus-4-7',
    format: 'openai',
    backend: 'dmx',
  },
  kimiK26CodePreviewFree: {
    id: 'kimiK26CodePreviewFree',
    name: 'K2.6-code-preview-free+dmx',
    model: 'K2.6-code-preview-free',
    format: 'openai',
    backend: 'dmx',
  },
  kimiK26Moonshot: {
    id: 'kimiK26Moonshot',
    name: 'kimi-k2.6+moonshot',
    model: 'kimi-k2.6',
    format: 'openai',
    backend: 'moonshot',
  },
  gemini31ProRightcode: {
    id: 'gemini31ProRightcode',
    name: 'gemini-3.1-pro+rightcode',
    model: 'gemini-3.1-pro-preview',
    format: 'gemini',
    backend: 'rightcode-gemini',
  },
  gemini31ProCubence: {
    id: 'gemini31ProCubence',
    name: 'gemini-3.1-pro+cubence',
    model: 'gemini-3.1-pro-preview',
    format: 'gemini',
    backend: 'cubence-gemini',
  },
  gemini31ProIkun: {
    id: 'gemini31ProIkun',
    name: 'gemini-3.1-pro+ikun',
    model: 'gemini-3.1-pro-preview',
    format: 'gemini',
    backend: 'ikun-gemini',
  },
  gemini3FlashIkun: {
    id: 'gemini3FlashIkun',
    name: 'gemini-3-flash-preview+ikun',
    model: 'gemini-3-flash-preview',
    format: 'gemini',
    backend: 'ikun-gemini',
  },
  gpt54Rightcode: {
    id: 'gpt54Rightcode',
    name: 'gpt-5.4+rightcode',
    model: 'gpt-5.4-high',
    format: 'openai-responses',
    backend: 'rightcode-openai',
  },
  gpt54Cubence: {
    id: 'gpt54Cubence',
    name: 'gpt-5.4+cubence',
    model: 'gpt-5.4-high',
    format: 'openai-responses',
    backend: 'cubence-openai',
  },
  gpt54Ikun: {
    id: 'gpt54Ikun',
    name: 'gpt-5.4+ikun',
    model: 'gpt-5.4-high',
    format: 'openai-responses',
    backend: 'ikun-openai',
  },
  gpt55Ikun: {
    id: 'gpt55Ikun',
    name: 'gpt-5.5+ikun',
    model: 'gpt-5.5',
    format: 'openai-responses',
    backend: 'ikun-openai',
  },
  claudeOpus46Rightcode: {
    id: 'claudeOpus46Rightcode',
    name: 'opus-4-6+rightcode',
    model: 'claude-opus-4-6',
    format: 'anthropic',
    backend: 'rightcode-claude',
  },
  claudeOpus46Cubence: {
    id: 'claudeOpus46Cubence',
    name: 'opus-4-6+cubence',
    model: 'claude-opus-4-6',
    format: 'anthropic',
    backend: 'cubence-claude',
  },
  claudeSonnet46Ikun: {
    id: 'claudeSonnet46Ikun',
    name: 'sonnet-4-6+ikun',
    model: 'claude-sonnet-4-6',
    format: 'anthropic',
    backend: 'ikun',
  },
  claudeSonnet5Ikun: {
    id: 'claudeSonnet5Ikun',
    name: 'sonnet-5+ikun',
    model: 'claude-sonnet-5',
    format: 'anthropic',
    backend: 'ikun',
  },
  claudeHaiku45Ikun: {
    id: 'claudeHaiku45Ikun',
    name: 'haiku-4-5-20251001+ikun',
    model: 'claude-haiku-4-5-20251001',
    format: 'anthropic',
    backend: 'ikun',
  },
  claudeHaiku45Rightcode: {
    id: 'claudeHaiku45Rightcode',
    name: 'haiku-4-5+rightcode',
    model: 'claude-haiku-4-5-20251001',
    format: 'anthropic',
    backend: 'rightcode-claude',
  },
  claudeSonnet46Rightcode: {
    id: 'claudeSonnet46Rightcode',
    name: 'sonnet-4-6+rightcode',
    model: 'claude-sonnet-4-6',
    format: 'anthropic',
    backend: 'rightcode-claude',
  },
  claudeOpus46RightcodeSale: {
    id: 'claudeOpus46RightcodeSale',
    name: 'opus-4-6+rightcode-sale',
    model: 'claude-opus-4-6',
    format: 'anthropic',
    backend: 'rightcode-claude-sale',
  },
  openrouterHunterAlpha: {
    id: 'openrouterHunterAlpha',
    name: 'hunter-alpha+openrouter',
    model: 'openrouter/hunter-alpha',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterHealerAlpha: {
    id: 'openrouterHealerAlpha',
    name: 'healer-alpha+openrouter',
    model: 'openrouter/healer-alpha',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterOwlAlpha: {
    id: 'openrouterOwlAlpha',
    name: 'owl-alpha+openrouter',
    model: 'openrouter/owl-alpha',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterNemotron: {
    id: 'openrouterNemotron',
    name: 'nemotron-3-super+openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterNemotronUltra: {
    id: 'openrouterNemotronUltra',
    name: 'nemotron-3-ultra+openrouter',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterNexN2ProFree: {
    id: 'openrouterNexN2ProFree',
    name: 'nex-n2-pro-free+openrouter',
    model: 'nex-agi/nex-n2-pro:free',
    format: 'openai',
    backend: 'openrouter',
  },
  gpt5NanoOpenrouter: {
    id: 'gpt5NanoOpenrouter',
    name: 'gpt-5-nano+openrouter',
    model: 'openai/gpt-5-nano',
    format: 'openai',
    backend: 'openrouter',
  },
  gemini31FlashLiteOpenrouter: {
    id: 'gemini31FlashLiteOpenrouter',
    name: 'gemini-3.1-flash-lite+openrouter',
    model: 'google/gemini-3.1-flash-lite-preview',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterQwen36PlusFree: {
    id: 'openrouterQwen36PlusFree',
    name: 'qwen3.6-plus-free+openrouter',
    model: 'qwen/qwen3.6-plus:free',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterQwen36Plus: {
    id: 'openrouterQwen36Plus',
    name: 'qwen3.6-plus+openrouter',
    model: 'qwen/qwen3.6-plus',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterQwen36MaxPreview: {
    id: 'openrouterQwen36MaxPreview',
    name: 'qwen3.6-max-preview+openrouter',
    model: 'qwen/qwen3.6-max-preview',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterGemma431bIt: {
    id: 'openrouterGemma431bIt',
    name: 'gemma-4-31b-it+openrouter',
    model: 'google/gemma-4-31b-it',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterLing26OneTFree: {
    id: 'openrouterLing26OneTFree',
    name: 'ling-2.6-1t-free+openrouter',
    model: 'inclusionai/ling-2.6-1t:free',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterHy3PreviewFree: {
    id: 'openrouterHy3PreviewFree',
    name: 'hy3-preview-free+openrouter',
    model: 'tencent/hy3-preview:free',
    format: 'openai',
    backend: 'openrouter',
  },
  gemma431bItAistudio: {
    id: 'gemma431bItAistudio',
    name: 'gemma-4-31b-it+aistudio',
    model: 'gemma-4-31b-it',
    format: 'gemini',
    backend: 'gemini-aistudio',
  },
  openrouterGrok420MultiAgent: {
    id: 'openrouterGrok420MultiAgent',
    name: 'grok-4.20-multi-agent+openrouter',
    model: 'x-ai/grok-4.20-multi-agent',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterMimoV2Pro: {
    id: 'openrouterMimoV2Pro',
    name: 'mimo-v2-pro+openrouter',
    model: 'xiaomi/mimo-v2-pro',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterMimoV25Pro: {
    id: 'openrouterMimoV25Pro',
    name: 'mimo-v2.5-pro+openrouter',
    model: 'xiaomi/mimo-v2.5-pro',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterKimiK26: {
    id: 'openrouterKimiK26',
    name: 'kimi-k2.6+openrouter',
    model: 'moonshotai/kimi-k2.6',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterKimiK27Code: {
    id: 'openrouterKimiK27Code',
    name: 'kimi-k2.7-code+openrouter',
    model: 'moonshotai/kimi-k2.7-code',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterGlm51: {
    id: 'openrouterGlm51',
    name: 'glm-5.1+openrouter',
    model: 'z-ai/glm-5.1',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterGlm52: {
    id: 'openrouterGlm52',
    name: 'glm-5.2+openrouter',
    model: 'z-ai/glm-5.2',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterDeepseekV4Pro: {
    id: 'openrouterDeepseekV4Pro',
    name: 'deepseek-v4-pro+openrouter',
    model: 'deepseek/deepseek-v4-pro',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterMinimaxM3: {
    id: 'openrouterMinimaxM3',
    name: 'minimax-m3+openrouter',
    model: 'minimax/minimax-m3',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterStep37Flash: {
    id: 'openrouterStep37Flash',
    name: 'step-3.7-flash+openrouter',
    model: 'stepfun/step-3.7-flash',
    format: 'openai',
    backend: 'openrouter',
  },
  openrouterQwen37Max: {
    id: 'openrouterQwen37Max',
    name: 'qwen3.7-max+openrouter',
    model: 'qwen/qwen3.7-max',
    format: 'openai',
    backend: 'openrouter',
  },
};

export const getAvailableModels = (): { id: string; name: string }[] =>
  Object.values(MODEL_CONFIGS).map(({ id, name }) => ({ id, name }));

export const getModelConfig = (modelId: string): ModelConfig | null => {
  const id = modelId.trim();
  return (
    MODEL_CONFIGS[id] ??
    Object.values(MODEL_CONFIGS).find((entry) => entry.id === id || entry.name === id) ??
    null
  );
};

export const getDefaultModelId = (): string | null => getAvailableModels()[0]?.id ?? null;

export const getDefaultModelConfig = (): ModelConfig | null => {
  const id = getDefaultModelId();
  return id ? getModelConfig(id) : null;
};

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
export const TITLE_GENERATION_MODEL_ID = 'gemini31FlashLiteOpenrouter';
