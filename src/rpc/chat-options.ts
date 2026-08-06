import { createServerFn } from '@tanstack/solid-start';
import { getAvailablePrompts } from '@/shared/chat/model-catalog';

export const getAvailableModelsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAvailableModels } = await import('@/backend/chat/model-catalog/available-models');
  return getAvailableModels();
});

export const getAvailablePromptsFn = createServerFn({ method: 'GET' }).handler(() =>
  getAvailablePrompts(),
);
