import { useSyncExternalStore } from 'react';
import { DEFAULT_MODEL_ID } from '@/shared/chat/model-catalog';

let modelId = DEFAULT_MODEL_ID;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const currentModelId = () => modelId;

export const useCurrentModelId = () =>
  useSyncExternalStore(subscribe, currentModelId, currentModelId);

export const setCurrentModelId = (nextModelId: string) => {
  if (modelId === nextModelId) return;
  modelId = nextModelId;
  for (const listener of listeners) listener();
};
