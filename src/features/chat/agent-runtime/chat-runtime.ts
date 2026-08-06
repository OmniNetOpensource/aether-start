import { createSignal } from 'solid-js';
import { artifactActions } from '@/features/chat/artifact/artifact-state';
import {
  getMessageTreeState,
  messageTreeActions,
} from '@/features/conversations/conversation-tree/message-tree-state';
import {
  conversationId,
  setConversationId,
  setPageTitle,
} from '@/features/conversations/session/conversation-meta';
import {
  currentFetchProvider,
  currentModelId,
  currentPromptId,
} from '@/features/conversations/session/chat-selection';
import type { ToastApi } from '@/shared/app-shell/useToast';
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
