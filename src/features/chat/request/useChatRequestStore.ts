import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ChatStatus = 'idle' | 'sending' | 'streaming';

export const initialChatRequestState = { status: 'idle' as ChatStatus };

export const useChatRequestStore = create<{
  status: ChatStatus;
  setStatus: (status: ChatStatus, actionName?: string) => void;
}>()(
  devtools(
    (set) => ({
      ...initialChatRequestState,
      setStatus: (status, actionName) => set({ status }, false, actionName ?? 'setStatus'),
    }),
    { name: 'ChatRequestStore' },
  ),
);
