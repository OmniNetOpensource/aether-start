import { ThinkingLevel } from '@google/genai';

export const buildGeminiThinkingConfig = (model: string) => {
  if (model.startsWith('gemma-') || model.startsWith('gemini-3')) {
    return {
      includeThoughts: true,
      thinkingLevel: ThinkingLevel.HIGH,
    };
  }

  return {
    includeThoughts: true,
    thinkingBudget: -1,
  };
};
