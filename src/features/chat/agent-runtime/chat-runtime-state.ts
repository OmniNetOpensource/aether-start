import type { ChatSessionActions, ChatSessionState } from '@/features/conversations/session';
import type { ToastApi } from '@/shared/app-shell/useToast';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'stopping';

export type ChatRuntimeState = {
  getSession: () => ChatSessionState;
  session: ChatSessionActions;
  getStatus: () => ChatStatus;
  setStatus: (status: ChatStatus) => void;
  toast: ToastApi;
};
