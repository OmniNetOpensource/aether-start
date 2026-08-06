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

export const CHAT_SELECTION_COOKIE_KEY = 'aether_chat_selection';

export const parseChatSessionSelection = (value: string | undefined): ChatSessionSelectionState => {
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
