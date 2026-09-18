import type { RichComposerEditorHandle } from './RichComposerEditor';
import type { QuoteItem } from '@/shared/chat/message';

export type ActiveInputTarget = { type: 'composer' } | { type: 'edit'; messageId: number };

let lastFocusedInput: ActiveInputTarget | null = null;
let composerEditor: RichComposerEditorHandle | null = null;
const messageEditors = new Map<number, RichComposerEditorHandle>();

export function setLastFocusedInput(target: ActiveInputTarget) {
  lastFocusedInput = target;
}

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

export function addQuoteToActiveInput(quote: Omit<QuoteItem, 'id'>) {
  const trimmed = quote.text.trim();
  if (!trimmed) return;

  const editor =
    lastFocusedInput?.type === 'edit'
      ? messageEditors.get(lastFocusedInput.messageId)
      : composerEditor;
  (editor ?? composerEditor)?.insertQuote({ ...quote, text: trimmed });
}
