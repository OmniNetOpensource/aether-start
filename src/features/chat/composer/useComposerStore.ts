import { create } from "zustand";
import { uploadAttachmentFile } from "@/shared/attachments";
import type { Attachment } from "@/features/chat/types/message";

const UPLOAD_CONCURRENCY = 4;

type PendingQuote = { id: string; text: string };

type ComposerState = {
  input: string;
  pendingAttachments: Attachment[];
  pendingQuotes: PendingQuote[];
  uploading: boolean;
  _uploadGeneration: number;
};

type ComposerActions = {
  setInput: (value: string) => void;
  setPendingAttachments: (attachments: Attachment[]) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  addQuote: (text: string) => void;
  removeQuote: (id: string) => void;
  clearInput: () => void;
  clearAttachments: () => void;
  clear: () => void;
};

export const useComposerStore = create<ComposerState & ComposerActions>()(
  (set, get) => ({
    input: "",
    pendingAttachments: [],
    pendingQuotes: [],
    uploading: false,
    _uploadGeneration: 0,
    setInput: (value) => set({ input: value }),
    setPendingAttachments: (attachments) =>
      set({ pendingAttachments: attachments }),
    addAttachments: async (files) => {
      if (files.length === 0 || get().uploading) {
        return;
      }

      const uploadGeneration = get()._uploadGeneration + 1;
      set({ uploading: true, _uploadGeneration: uploadGeneration });

      let running = 0;
      const queue: Array<() => void> = [];
      const acquire = (): Promise<void> =>
        running < UPLOAD_CONCURRENCY
          ? ((running += 1), Promise.resolve())
          : new Promise((res) => queue.push(res));
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
            if (get()._uploadGeneration !== uploadGeneration) return;
            if (attachment) {
              set((state) => ({
                pendingAttachments: [...state.pendingAttachments, attachment],
              }));
            }
          } finally {
            release();
          }
        }),
      );

      if (get()._uploadGeneration !== uploadGeneration) return;
      set({ uploading: false });
    },
    removeAttachment: (id) =>
      set((state) => ({
        pendingAttachments: state.pendingAttachments.filter(
          (item) => item.id !== id,
        ),
      })),
    addQuote: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `quote_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      set((state) => ({
        pendingQuotes: [...state.pendingQuotes, { id, text: trimmed }],
      }));
    },
    removeQuote: (id) =>
      set((state) => ({
        pendingQuotes: state.pendingQuotes.filter((q) => q.id !== id),
      })),
    clearInput: () => set({ input: "" }),
    clearAttachments: () =>
      set((state) => ({
        pendingAttachments: [],
        uploading: false,
        _uploadGeneration: state._uploadGeneration + 1,
      })),
    clear: () =>
      set((state) => ({
        input: "",
        pendingAttachments: [],
        pendingQuotes: [],
        uploading: false,
        _uploadGeneration: state._uploadGeneration + 1,
      })),
  }),
);
