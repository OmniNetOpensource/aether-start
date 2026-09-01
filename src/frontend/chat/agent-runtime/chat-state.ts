import { useSyncExternalStore } from 'react';
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
import { currentModelId } from '@/frontend/conversations/session/chat-selection';
import type { ToastApi } from '@/frontend/app-shell/useToast';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'stopping';

export type ChatState = {
  getConversationId: () => string | null;
  setConversationId: (conversationId: string | null) => void;
  getCurrentModelId: () => string;
  getMessageTree: () => MessageTreeState;
  messageTree: MessageTreeActions;
  artifacts: ArtifactActions;
  setPageTitle: (title: string) => void;
  getStatus: () => ChatStatus;
  setStatus: (status: ChatStatus) => void;
  toast: ToastApi;
};

let chatStatus: ChatStatus = 'idle';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const status = () => chatStatus;
export const useChatStatus = () => useSyncExternalStore(subscribe, status, status);
export const setStatus = (nextStatus: ChatStatus) => {
  if (chatStatus === nextStatus) return;
  chatStatus = nextStatus;
  for (const listener of listeners) listener();
};

let toastApi: ToastApi;

export const registerChatToast = (toast: ToastApi) => {
  toastApi = toast;
};

export const chatState: ChatState = {
  getConversationId: conversationId,
  setConversationId,
  getCurrentModelId: currentModelId,
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
