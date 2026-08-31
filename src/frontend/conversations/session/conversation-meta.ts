import { useSyncExternalStore } from 'react';

type ConversationMetaState = {
  conversationId: string | null;
  pageTitle: string;
};

let conversationMeta: ConversationMetaState = {
  conversationId: null,
  pageTitle: 'Aether',
};
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const replaceConversationMeta = (nextMeta: ConversationMetaState) => {
  conversationMeta = nextMeta;
  for (const listener of listeners) listener();
};

export const conversationId = () => conversationMeta.conversationId;
export const pageTitle = () => conversationMeta.pageTitle;

export const useConversationId = () =>
  useSyncExternalStore(subscribe, conversationId, conversationId);
export const usePageTitle = () => useSyncExternalStore(subscribe, pageTitle, pageTitle);

export const setConversationId = (conversationId: string | null) => {
  if (conversationMeta.conversationId === conversationId) return;
  replaceConversationMeta({ ...conversationMeta, conversationId });
};

export const setPageTitle = (pageTitle: string) => {
  if (conversationMeta.pageTitle === pageTitle) return;
  replaceConversationMeta({ ...conversationMeta, pageTitle });
};

export const clearConversationMeta = () => {
  if (conversationMeta.conversationId === null && conversationMeta.pageTitle === 'Aether') return;
  replaceConversationMeta({ conversationId: null, pageTitle: 'Aether' });
};
