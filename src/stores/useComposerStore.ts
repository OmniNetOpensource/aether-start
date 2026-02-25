import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Attachment } from "@/features/chat/types/chat";
import { buildAttachmentsFromFiles } from "@/lib/chat/attachments";

type ComposerState = {
  input: string;
  pendingAttachments: Attachment[];
  uploading: boolean;
};

type ComposerActions = {
  setInput: (value: string) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearInput: () => void;
  clearAttachments: () => void;
  clear: () => void;
};

export const useComposerStore = create<ComposerState & ComposerActions>()(
  devtools(
    (set) => ({
      input: "",
      pendingAttachments: [],
      uploading: false,
      setInput: (value) => set({ input: value }),
      addAttachments: async (files) => {
        if (files.length === 0) {
          return;
        }

        set({ uploading: true });

        const attachments = await buildAttachmentsFromFiles(files);

        if (attachments.length === 0) {
          set({ uploading: false });
          return;
        }

        // 将新附件追加到现有待发送附件列表中
        set((state) => ({
          pendingAttachments: [...state.pendingAttachments, ...attachments],
          uploading: false,
        }));
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
      clearAttachments: () => set({ pendingAttachments: [] }),
      clear: () => {
        set({
          input: "",
          pendingAttachments: [],
          uploading: false,
        });
      },
    }),
    { name: "ComposerStore" }
  )
);
