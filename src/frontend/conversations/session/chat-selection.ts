import { useSyncExternalStore } from 'react';
import { DEFAULT_MODEL_ID, getDefaultPromptId } from '@/shared/chat/model-catalog';
import type { FetchProvider } from '@/shared/chat/tool-types';

type ChatSelection = {
  modelId: string;
  promptId: string;
  fetchProvider: FetchProvider;
};

let selection: ChatSelection = {
  modelId: DEFAULT_MODEL_ID,
  promptId: getDefaultPromptId(),
  fetchProvider: 'jina',
};
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const replaceSelection = (nextSelection: ChatSelection) => {
  selection = nextSelection;
  for (const listener of listeners) listener();
};

export const currentModelId = () => selection.modelId;
export const currentPromptId = () => selection.promptId;
export const currentFetchProvider = () => selection.fetchProvider;

export const useCurrentModelId = () =>
  useSyncExternalStore(subscribe, currentModelId, currentModelId);
export const useCurrentPromptId = () =>
  useSyncExternalStore(subscribe, currentPromptId, currentPromptId);
export const useCurrentFetchProvider = () =>
  useSyncExternalStore(subscribe, currentFetchProvider, currentFetchProvider);

export const setCurrentModelId = (modelId: string) => {
  if (selection.modelId === modelId) return;
  replaceSelection({ ...selection, modelId });
};

export const setCurrentPromptId = (promptId: string) => {
  if (selection.promptId === promptId) return;
  replaceSelection({ ...selection, promptId });
};

export const setCurrentFetchProvider = (fetchProvider: FetchProvider) => {
  if (selection.fetchProvider === fetchProvider) return;
  replaceSelection({ ...selection, fetchProvider });
};
