import { createServerFn } from '@tanstack/react-start';

export const getAvailableModelsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAvailableModels } = await import('@/backend/chat/model-catalog/available-models');
  return getAvailableModels();
});
