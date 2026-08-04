import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getZustandDevtoolsOptions } from '@/shared/browser/zustand-devtools';
import type { ComposerDocument } from './composer-document';

const STORE_FILE_NAME = 'useComposerStore.ts';

type ComposerState = {
  document: ComposerDocument;
};

type ComposerActions = {
  setDocument: (document: ComposerDocument) => void;
  restoreMessageDraft: (document: ComposerDocument) => void;
  clear: () => void;
};

const getActionName = (actionName: string) => {
  if (!import.meta.env.DEV) {
    return actionName;
  }

  const stack = new Error().stack?.split('\n') ?? [];
  const line = stack.find((item) => item.includes('src/') && !item.includes(STORE_FILE_NAME));
  const callsite = line
    ?.match(/(?:\/|\\)(src[/\\][^)\s]+?(?:\?[^:\s)]+)?:\d+:\d+)/)?.[1]
    ?.replace(/\\/g, '/')
    ?.replace(/\?[^:\s)]+/, '');

  return callsite ? `${actionName} @ ${callsite}` : actionName;
};

export const useComposerStore = create<ComposerState & ComposerActions>()(
  devtools(
    (set) => ({
      document: [],
      setDocument: (document) => set({ document }, false, getActionName('composer/setDocument')),
      restoreMessageDraft: (document) =>
        set({ document }, false, getActionName('composer/restoreMessageDraft')),
      clear: () => set({ document: [] }, false, getActionName('composer/clear')),
    }),
    getZustandDevtoolsOptions('ComposerStore'),
  ),
);
