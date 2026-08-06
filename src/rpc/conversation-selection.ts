import { createServerFn } from '@tanstack/solid-start';
import {
  CHAT_SELECTION_COOKIE_KEY,
  parseChatSessionSelection,
} from '@/shared/conversations/chat-selection';

export const getChatSessionSelectionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getCookie } = await import('@tanstack/solid-start/server');
  return parseChatSessionSelection(getCookie(CHAT_SELECTION_COOKIE_KEY));
});
