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
      setStatus: (status, actionName) => {
        const name = actionName ?? 'setStatus';

        if (!import.meta.env.DEV) {
          set({ status }, false, name);
          return;
        }

        const stack = new Error().stack?.split('\n') ?? [];
        const line = stack.find(
          (item) => item.includes('src/') && !item.includes('useChatRequestStore.ts'),
        );
        const callsite = line
          ?.match(/(?:\/|\\)(src[\/\\][^)\s]+?(?:\?[^:\s)]+)?:\d+:\d+)/)?.[1]
          ?.replace(/\\/g, '/')
          ?.replace(/\?[^:\s)]+/, '');

        set({ status }, false, callsite ? `${name} @ ${callsite}` : name);
      },
    }),
    { name: 'ChatRequestStore' },
  ),
);
