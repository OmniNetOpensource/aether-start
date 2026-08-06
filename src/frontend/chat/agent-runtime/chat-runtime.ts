import { createSignal } from 'solid-js';
import { artifactActions } from '@/frontend/chat/artifact/artifact-state';
import {
  getMessageTreeState,
  messageTreeActions,
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
import type { ChatRuntimeState, ChatStatus } from './chat-runtime-state';

const [status, setStatus] = createSignal<ChatStatus>('idle');
export { status };

let toastApi: ToastApi;

export const registerChatToast = (toast: ToastApi) => {
  toastApi = toast;
};

export const chatRuntime: ChatRuntimeState = {
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
