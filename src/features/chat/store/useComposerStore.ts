import { create } from "zustand";
import type { Attachment } from "@/types/message";
import { uploadAttachmentFile } from "@/lib/chat/attachments";

const UPLOAD_CONCURRENCY = 4;

type ComposerState = {
  input: string;
  pendingAttachments: Attachment[];
  uploading: boolean;
  _uploadGeneration: number;
};

type ComposerActions = {
  setInput: (value: string) => void;
  setPendingAttachments: (attachments: Attachment[]) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearInput: () => void;
  clearAttachments: () => void;
  clear: () => void;
};

export const useComposerStore = create<ComposerState & ComposerActions>()(
  (set, get) => ({
    input: "",
    pendingAttachments: [],
    uploading: false,
    _uploadGeneration: 0,
    setInput: (value) => set({ input: value }),
    setPendingAttachments: (attachments) => set({ pendingAttachments: attachments }),
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
      set((state) => {
        return {
          pendingAttachments: state.pendingAttachments.filter(
            (item) => item.id !== id
          ),
        };
      }),
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
        uploading: false,
        _uploadGeneration: state._uploadGeneration + 1,
      })),
  })
);
