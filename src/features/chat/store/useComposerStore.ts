import { create } from "zustand";
import type { Attachment } from "@/types/message";
import {
  createPendingAttachmentUpload,
  revokePendingAttachmentUpload,
  type PendingAttachmentUpload,
  uploadAttachmentFile,
} from "@/lib/chat/attachments";

type ComposerState = {
  input: string;
  pendingAttachments: Attachment[];
  uploadingAttachments: PendingAttachmentUpload[];
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
    uploadingAttachments: [],
    uploading: false,
    _uploadGeneration: 0,
    setInput: (value) => set({ input: value }),
    setPendingAttachments: (attachments) => set({ pendingAttachments: attachments }),
    addAttachments: async (files) => {
      if (files.length === 0 || get().uploading) {
        return;
      }

      const uploadingAttachments = files.map(createPendingAttachmentUpload);
      const uploadGeneration = get()._uploadGeneration + 1;

      set((state) => ({
        uploading: true,
        uploadingAttachments: [...state.uploadingAttachments, ...uploadingAttachments],
        _uploadGeneration: uploadGeneration,
      }));

      await Promise.allSettled(
        files.map(async (file, index) => {
          const draft = uploadingAttachments[index];
          const attachment = await uploadAttachmentFile(file);

          revokePendingAttachmentUpload(draft);

          if (get()._uploadGeneration !== uploadGeneration) {
            return;
          }

          set((state) => ({
            pendingAttachments: attachment
              ? [...state.pendingAttachments, attachment]
              : state.pendingAttachments,
            uploadingAttachments: state.uploadingAttachments.filter(
              (item) => item.id !== draft.id
            ),
          }));
        }),
      );

      if (get()._uploadGeneration !== uploadGeneration) {
        return;
      }

      set((state) => ({
        uploading: false,
        uploadingAttachments: state.uploadingAttachments.filter(
          (item) => !uploadingAttachments.some((draft) => draft.id === item.id)
        ),
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
    clearAttachments: () =>
      set((state) => {
        for (const attachment of state.uploadingAttachments) {
          revokePendingAttachmentUpload(attachment);
        }

        return {
          pendingAttachments: [],
          uploadingAttachments: [],
          uploading: false,
          _uploadGeneration: state._uploadGeneration + 1,
        };
      }),
    clear: () => {
      set((state) => {
        for (const attachment of state.uploadingAttachments) {
          revokePendingAttachmentUpload(attachment);
        }

        return {
          input: "",
          pendingAttachments: [],
          uploadingAttachments: [],
          uploading: false,
          _uploadGeneration: state._uploadGeneration + 1,
        };
      });
    },
  })
);
