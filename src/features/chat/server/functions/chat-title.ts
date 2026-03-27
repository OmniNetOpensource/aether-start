import {
  getModelConfig,
  getBackendConfig,
  TITLE_GENERATION_MODEL_ID,
} from '@/features/chat/server/agents/services/model-provider-config';
import { log } from '@/features/chat/server/agents/services/logger';

const FALLBACK_TITLE = 'New Chat';

const sanitizeTitle = (value: string) => {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};
const CONVERSATION_TITLE_TIMEOUT_MS = 60_000;

const TITLE_PROMPT =
  'Based on this conversation, generate a short title (max 10 chars, no quotes). Use the same language as the conversation.';

export const generateTitleFromConversation = async (
  conversationTranscript: string,
): Promise<string> => {
  const completeTitleGeneration = (title: string, data?: Record<string, unknown>) => {
    log('TITLE', 'Title generation completed', {
      title,
      ...data,
    });
    return title;
  };

  if (!conversationTranscript.trim()) {
    return completeTitleGeneration(FALLBACK_TITLE, {
      usedFallback: true,
      reason: 'empty_transcript',
    });
  }

  const modelConfig = getModelConfig(TITLE_GENERATION_MODEL_ID);
  if (!modelConfig) {
    return completeTitleGeneration(FALLBACK_TITLE, {
      usedFallback: true,
      reason: 'missing_model_config',
      modelId: TITLE_GENERATION_MODEL_ID,
    });
  }

  let backendConfig: ReturnType<typeof getBackendConfig>;
  try {
    backendConfig = getBackendConfig(modelConfig.backend);
  } catch {
    return completeTitleGeneration(FALLBACK_TITLE, {
      usedFallback: true,
      reason: 'invalid_backend_config',
      modelId: modelConfig.id,
      backend: modelConfig.backend,
    });
  }

  const prompt = [TITLE_PROMPT, conversationTranscript].join('\n');
  const signal = AbortSignal.timeout(CONVERSATION_TITLE_TIMEOUT_MS);
  const requestLog = {
    modelId: modelConfig.id,
    model: modelConfig.model,
    format: modelConfig.format,
    backend: modelConfig.backend,
    max_tokens: 64,
    temperature: 0.2,
    prompt,
  };

  try {
    if (modelConfig.format === 'anthropic') {
      log('TITLE', 'Sending title generation request', requestLog);

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({
        apiKey: backendConfig.apiKey,
        baseURL: backendConfig.baseURL,
        defaultHeaders: backendConfig.defaultHeaders,
      });

      const message = await client.messages.create(
        {
          model: modelConfig.model,
          max_tokens: 64,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal },
      );

      const textBlock = message.content.find((block) => block.type === 'text');
      const rawTitle = textBlock && 'text' in textBlock ? String(textBlock.text).trim() : '';
      const title = typeof rawTitle === 'string' ? sanitizeTitle(rawTitle) : '';

      log('TITLE', 'Received title generation response', {
        ...requestLog,
        response: {
          id: message.id,
          model: message.model,
          role: message.role,
          stop_reason: message.stop_reason,
          usage: message.usage,
          content: message.content,
        },
        rawTitle,
        title,
      });

      const resolvedTitle = title || FALLBACK_TITLE;
      return completeTitleGeneration(resolvedTitle, {
        modelId: modelConfig.id,
        backend: modelConfig.backend,
        usedFallback: !title,
        reason: title ? 'success' : 'empty_model_output',
      });
    }

    log('TITLE', 'Sending title generation request', requestLog);

    const { getOpenAIClient } = await import('@/features/chat/server/agents/services/openai');
    const client = getOpenAIClient(backendConfig);
    const response = await client.chat.completions.create(
      {
        model: modelConfig.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 64,
        temperature: 0.2,
        ...(modelConfig.backend === 'openrouter' && {
          reasoning: { effort: 'none' as const },
        }),
      },
      { signal },
    );

    const rawTitle = response.choices?.[0]?.message?.content?.trim() ?? '';
    const title = typeof rawTitle === 'string' ? sanitizeTitle(rawTitle) : '';

    log('TITLE', 'Received title generation response', {
      ...requestLog,
      response: {
        id: response.id,
        model: response.model,
        usage: response.usage,
        choices: response.choices?.map((choice) => ({
          index: choice.index,
          finish_reason: choice.finish_reason,
          role: choice.message?.role,
          content: choice.message?.content ?? null,
        })),
      },
      rawTitle,
      title,
    });

    const resolvedTitle = title || FALLBACK_TITLE;
    return completeTitleGeneration(resolvedTitle, {
      modelId: modelConfig.id,
      backend: modelConfig.backend,
      usedFallback: !title,
      reason: title ? 'success' : 'empty_model_output',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('TITLE', 'Title generation from conversation failed', {
      error: message,
      fullError: error,
    });
    return completeTitleGeneration(FALLBACK_TITLE, {
      modelId: modelConfig.id,
      backend: modelConfig.backend,
      usedFallback: true,
      reason: 'request_failed',
      error: message,
    });
  }
};
