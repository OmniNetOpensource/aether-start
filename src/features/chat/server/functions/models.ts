import { createServerFn } from '@tanstack/react-start';
import {
  getAvailableModels,
  getAvailablePrompts,
} from '@/server/agents/services/model-provider-config';

export const getAvailableModelsFn = createServerFn({ method: 'GET' }).handler(() =>
  getAvailableModels(),
);

export const getAvailablePromptsFn = createServerFn({ method: 'GET' }).handler(() =>
  getAvailablePrompts(),
);
