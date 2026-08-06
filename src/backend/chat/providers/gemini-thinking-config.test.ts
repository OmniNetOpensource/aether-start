import { ThinkingLevel } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { buildGeminiThinkingConfig } from './gemini-thinking-config';

describe('buildGeminiThinkingConfig', () => {
  it('uses thinking level for gemma models', () => {
    expect(buildGeminiThinkingConfig('gemma-4-31b-it')).toEqual({
      includeThoughts: true,
      thinkingLevel: ThinkingLevel.HIGH,
    });
  });

  it('uses thinking level for gemini 3 models', () => {
    expect(buildGeminiThinkingConfig('gemini-3.1-pro-preview')).toEqual({
      includeThoughts: true,
      thinkingLevel: ThinkingLevel.HIGH,
    });
  });

  it('uses thinking budget for gemini 2.5 models', () => {
    expect(buildGeminiThinkingConfig('gemini-2.5-flash')).toEqual({
      includeThoughts: true,
      thinkingBudget: -1,
    });
  });
});
