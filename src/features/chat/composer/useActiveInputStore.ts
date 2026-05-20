import { create } from 'zustand';
import { useComposerStore } from '@/features/chat/composer/useComposerStore';
import { useEditingStore } from '@/features/chat/message-thread/useEditingStore';

export type ActiveInputTarget =
  | { type: 'composer' }
  | { type: 'edit'; messageId: number };

type ActiveInputState = {
  lastFocused: ActiveInputTarget | null;
  setLastFocused: (target: ActiveInputTarget) => void;
};

export const useActiveInputStore = create<ActiveInputState>()((set) => ({
  lastFocused: null,
  setLastFocused: (target) => set({ lastFocused: target }),
}));

export function addQuoteToActiveInput(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const target = useActiveInputStore.getState().lastFocused;
  const editing = useEditingStore.getState().editingState;

  if (target?.type === 'edit' && editing?.messageId === target.messageId) {
    useEditingStore.getState().addEditQuote(trimmed);
    return;
  }

  useComposerStore.getState().addQuote(trimmed);
}
