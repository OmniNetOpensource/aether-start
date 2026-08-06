import type { ArtifactActions } from '@/features/chat/artifact/artifact-state';
import type {
  MessageTreeActions,
  MessageTreeState,
} from '@/features/conversations/conversation-tree/message-tree-state';
import type { ChatSessionSelectionState } from '@/features/conversations/session/chat-selection';
import type { ToastApi } from '@/shared/app-shell/useToast';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'stopping';

export type ChatRuntimeState = {
  getConversationId: () => string | null;
  setConversationId: (conversationId: string | null) => void;
  getCurrentModelId: () => string;
  getCurrentPromptId: () => string;
  getCurrentFetchProvider: () => ChatSessionSelectionState['currentFetchProvider'];
  getMessageTree: () => MessageTreeState;
  messageTree: MessageTreeActions;
  artifacts: ArtifactActions;
  setPageTitle: (title: string) => void;
  getStatus: () => ChatStatus;
  setStatus: (status: ChatStatus) => void;
  toast: ToastApi;
};
