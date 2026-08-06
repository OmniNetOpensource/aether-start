import { createServerFn } from '@tanstack/solid-start';
import { createSignal } from 'solid-js';

export type ChatSessionSelectionState = {
  currentModelId: string;
  currentPromptId: string;
  currentFetchProvider: 'jina' | 'firecrawl' | 'exa';
};

export const initialChatSessionSelectionState: ChatSessionSelectionState = {
  currentModelId: '',
  currentPromptId: '',
  currentFetchProvider: 'jina',
};

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

const SELECTION_COOKIE_KEY = 'aether_chat_selection';

const parseChatSessionSelection = (value: string | undefined): ChatSessionSelectionState => {
  if (!value) return initialChatSessionSelectionState;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return initialChatSessionSelectionState;
  }
  if (!parsed || typeof parsed !== 'object') return initialChatSessionSelectionState;

  return {
    currentModelId:
      'currentModelId' in parsed && typeof parsed.currentModelId === 'string'
        ? parsed.currentModelId
        : '',
    currentPromptId:
      'currentPromptId' in parsed && typeof parsed.currentPromptId === 'string'
        ? parsed.currentPromptId
        : '',
    currentFetchProvider:
      'currentFetchProvider' in parsed &&
      (parsed.currentFetchProvider === 'firecrawl' || parsed.currentFetchProvider === 'exa')
        ? parsed.currentFetchProvider
        : 'jina',
  };
};

export const getChatSessionSelectionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getCookie } = await import('@tanstack/solid-start/server');
  return parseChatSessionSelection(getCookie(SELECTION_COOKIE_KEY));
});

export const persistChatSessionSelection = (
  currentModelId: string,
  currentPromptId: string,
  currentFetchProvider: ChatSessionSelectionState['currentFetchProvider'],
) => {
  const value = encodeURIComponent(
    JSON.stringify({ currentModelId, currentPromptId, currentFetchProvider }),
  );
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SELECTION_COOKIE_KEY}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
};
