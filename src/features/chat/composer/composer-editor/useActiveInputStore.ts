import { create } from 'zustand';
import type { RichComposerEditorHandle } from './RichComposerEditor';

export type ActiveInputTarget = { type: 'composer' } | { type: 'edit'; messageId: number };

type ActiveInputState = {
  lastFocused: ActiveInputTarget | null;
  setLastFocused: (target: ActiveInputTarget) => void;
};

export const useActiveInputStore = create<ActiveInputState>()((set) => ({
  lastFocused: null,
  setLastFocused: (target) => set({ lastFocused: target }),
}));

let composerEditor: RichComposerEditorHandle | null = null;
const messageEditors = new Map<number, RichComposerEditorHandle>();

export function registerActiveInput(
  target: ActiveInputTarget,
  editor: RichComposerEditorHandle | null,
) {
  if (target.type === 'composer') {
    composerEditor = editor;
    return;
  }

  if (editor) {
    messageEditors.set(target.messageId, editor);
  } else {
    messageEditors.delete(target.messageId);
  }
}

export function addQuoteToActiveInput(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const target = useActiveInputStore.getState().lastFocused;
  const editor = target?.type === 'edit' ? messageEditors.get(target.messageId) : composerEditor;
  (editor ?? composerEditor)?.insertQuote(trimmed);
}
