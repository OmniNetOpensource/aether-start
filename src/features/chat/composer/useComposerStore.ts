import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { uploadAttachmentFile } from '@/features/attachments/attachment-upload';
import type { Attachment } from '@/features/chat/message-thread';
import { getZustandDevtoolsOptions } from '@/shared/browser/zustand-devtools';

const UPLOAD_CONCURRENCY = 4;
const STORE_FILE_NAME = 'useComposerStore.ts';

type PendingQuote = { id: string; text: string };

type ComposerState = {
  input: string;
  pendingAttachments: Attachment[];
  pendingQuotes: PendingQuote[];
  uploading: boolean;
};

type ComposerActions = {
  setInput: (value: string) => void;
  setPendingAttachments: (attachments: Attachment[]) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  addQuote: (text: string) => void;
  removeQuote: (id: string) => void;
  clear: () => void;
};

const getActionName = (actionName: string) => {
  if (!import.meta.env.DEV) {
    return actionName;
  }

  const stack = new Error().stack?.split('\n') ?? [];
  const line = stack.find((item) => item.includes('src/') && !item.includes(STORE_FILE_NAME));
  const callsite = line
    ?.match(/(?:\/|\\)(src[/\\][^)\s]+?(?:\?[^:\s)]+)?:\d+:\d+)/)?.[1]
    ?.replace(/\\/g, '/')
    ?.replace(/\?[^:\s)]+/, '');

  return callsite ? `${actionName} @ ${callsite}` : actionName;
};

export const useComposerStore = create<ComposerState & ComposerActions>()(
  devtools(
    (set, get) => ({
      input: '',
      pendingAttachments: [],
      pendingQuotes: [],
      uploading: false,
      setInput: (value) => set({ input: value }, false, getActionName('composer/setInput')),
      setPendingAttachments: (attachments) =>
        set(
          { pendingAttachments: attachments },
          false,
          getActionName('composer/setPendingAttachments'),
        ),
      addAttachments: async (files) => {
        if (files.length === 0 || get().uploading) {
          return;
        }

        set({ uploading: true }, false, getActionName('composer/addAttachments/start'));

        let running = 0;
        const queue: Array<() => void> = [];
        const acquire = () =>
          new Promise<void>((resolve) => {
            if (running < UPLOAD_CONCURRENCY) {
              running += 1;
              resolve();
            } else {
              queue.push(resolve);
            }
          });
        const release = () => {
          running -= 1;
          const next = queue.shift();
          if (next) {
            running += 1;
            next();
          }
        };

        await Promise.allSettled(
          files.map(async (file) => {
            await acquire();
            try {
              const attachment = await uploadAttachmentFile(file);
              if (attachment) {
                set(
                  (state) => ({
                    pendingAttachments: [...state.pendingAttachments, attachment],
                  }),
                  false,
                  getActionName('composer/addAttachments/append'),
                );
              }
            } finally {
              release();
            }
          }),
        );

        set({ uploading: false }, false, getActionName('composer/addAttachments/finish'));
      },
      removeAttachment: (id) =>
        set(
          (state) => ({
            pendingAttachments: state.pendingAttachments.filter((item) => item.id !== id),
          }),
          false,
          getActionName('composer/removeAttachment'),
        ),
      addQuote: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `quote_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        set(
          (state) => ({
            pendingQuotes: [...state.pendingQuotes, { id, text: trimmed }],
          }),
          false,
          getActionName('composer/addQuote'),
        );
      },
      removeQuote: (id) =>
        set(
          (state) => ({
            pendingQuotes: state.pendingQuotes.filter((q) => q.id !== id),
          }),
          false,
          getActionName('composer/removeQuote'),
        ),
      clear: () =>
        set(
          { input: '', pendingAttachments: [], pendingQuotes: [] },
          false,
          getActionName('composer/clear'),
        ),
    }),
    getZustandDevtoolsOptions('ComposerStore'),
  ),
);
