import { createSignal } from 'solid-js';
import { artifactActions, type ArtifactActions } from '@/frontend/chat/artifact/artifact-state';
import {
  getMessageTreeState,
  messageTreeActions,
  type MessageTreeActions,
  type MessageTreeState,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import {
  conversationId,
  setConversationId,
  setPageTitle,
} from '@/frontend/conversations/session/conversation-meta';
import {
  currentFetchProvider,
  currentModelId,
  currentPromptId,
} from '@/frontend/conversations/session/chat-selection';
import type { ToastApi } from '@/frontend/app-shell/useToast';
import type { FetchProvider } from '@/shared/chat/tool-types';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'stopping';

export type ChatState = {
  getConversationId: () => string | null;
  setConversationId: (conversationId: string | null) => void;
  getCurrentModelId: () => string;
  getCurrentPromptId: () => string;
  getCurrentFetchProvider: () => FetchProvider;
  getMessageTree: () => MessageTreeState;
  messageTree: MessageTreeActions;
  artifacts: ArtifactActions;
  setPageTitle: (title: string) => void;
  getStatus: () => ChatStatus;
  setStatus: (status: ChatStatus) => void;
  toast: ToastApi;
};

const [status, setStatus] = createSignal<ChatStatus>('idle');
export { status };

let toastApi: ToastApi;

export const registerChatToast = (toast: ToastApi) => {
  toastApi = toast;
};

export const chatState: ChatState = {
  getConversationId: conversationId,
  setConversationId,
  getCurrentModelId: currentModelId,
  getCurrentPromptId: currentPromptId,
  getCurrentFetchProvider: currentFetchProvider,
  getMessageTree: getMessageTreeState,
  messageTree: messageTreeActions,
  artifacts: artifactActions,
  setPageTitle,
  getStatus: status,
  setStatus,
  get toast() {
    return toastApi;
  },
};
