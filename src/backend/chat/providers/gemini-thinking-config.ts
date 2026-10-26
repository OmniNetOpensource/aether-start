import { ThinkingLevel } from '@google/genai';

export const buildGeminiThinkingConfig = (model: string) => {
  if (model.startsWith('gemini-2.5')) {
    return {
      includeThoughts: true,
      thinkingBudget: model.startsWith('gemini-2.5-pro') ? 32768 : 24576,
    };
  }

  return {
    includeThoughts: true,
    thinkingLevel: ThinkingLevel.HIGH,
  };
};
