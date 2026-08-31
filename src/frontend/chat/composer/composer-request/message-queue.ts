import { useSyncExternalStore } from 'react';
import type { ComposerDocument } from '../composer-editor/composer-document';

/** 流式输出期间排队待发的消息，流结束后由 Composer 依次自动发送 */
let queue: ComposerDocument[] = [];
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const queuedMessages = () => queue;
export const useQueuedMessages = () =>
  useSyncExternalStore(subscribe, queuedMessages, queuedMessages);

export const setQueuedMessages = (
  nextQueue: ComposerDocument[] | ((currentQueue: ComposerDocument[]) => ComposerDocument[]),
) => {
  const resolvedQueue = typeof nextQueue === 'function' ? nextQueue(queue) : nextQueue;
  if (resolvedQueue === queue) return;
  queue = resolvedQueue;
  for (const listener of listeners) listener();
};
