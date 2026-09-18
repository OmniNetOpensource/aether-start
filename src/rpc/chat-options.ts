import { createServerFn } from '@tanstack/react-start';

export const getAvailableModelsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAvailableModels } = await import('@/backend/chat/model-catalog/available-models');
  return getAvailableModels();
});

export const refreshAvailableModelsFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { requireAdminSession } = await import('@/backend/auth/admin-access');
  await requireAdminSession();

  const { refreshAvailableModels } = await import('@/backend/chat/model-catalog/available-models');
  return refreshAvailableModels();
});
