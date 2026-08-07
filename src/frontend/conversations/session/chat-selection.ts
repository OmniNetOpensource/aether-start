import { createSignal } from 'solid-js';
import { DEFAULT_MODEL_ID, getDefaultPromptId } from '@/shared/chat/model-catalog';
import type { FetchProvider } from '@/shared/chat/tool-types';

const [currentModelId, setCurrentModelId] = createSignal(DEFAULT_MODEL_ID);
const [currentPromptId, setCurrentPromptId] = createSignal(getDefaultPromptId());
const [currentFetchProvider, setCurrentFetchProvider] = createSignal<FetchProvider>('jina');

export {
  currentFetchProvider,
  currentModelId,
  currentPromptId,
  setCurrentFetchProvider,
  setCurrentModelId,
  setCurrentPromptId,
};
