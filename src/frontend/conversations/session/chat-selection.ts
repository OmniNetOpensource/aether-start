import { createSignal } from 'solid-js';
import {
  CHAT_SELECTION_COOKIE_KEY,
  type ChatSessionSelectionState,
} from '@/shared/conversations/chat-selection';

export type { ChatSessionSelectionState } from '@/shared/conversations/chat-selection';

const [currentModelId, setCurrentModelId] = createSignal('');
const [currentPromptId, setCurrentPromptId] = createSignal('');
const [currentFetchProvider, setCurrentFetchProvider] =
  createSignal<ChatSessionSelectionState['currentFetchProvider']>('jina');

export {
  currentFetchProvider,
  currentModelId,
  currentPromptId,
  setCurrentFetchProvider,
  setCurrentModelId,
  setCurrentPromptId,
};

export const persistChatSessionSelection = (
  currentModelId: string,
  currentPromptId: string,
  currentFetchProvider: ChatSessionSelectionState['currentFetchProvider'],
) => {
  const value = encodeURIComponent(
    JSON.stringify({ currentModelId, currentPromptId, currentFetchProvider }),
  );
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CHAT_SELECTION_COOKIE_KEY}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
};
