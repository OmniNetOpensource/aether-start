import { RefObject } from "react";
import { create } from "zustand";
import type { Attachment } from "@/src/features/chat/types/chat";
import { buildAttachmentsFromFiles } from "@/src/features/chat/lib/attachments";

type ComposerState = {
  input: string;
  pendingAttachments: Attachment[];
  uploading: boolean;
  quotedTexts: QuotedText[];
  textareaRef: RefObject<HTMLTextAreaElement | null> | null;
};

type ComposerActions = {
  setInput: (value: string) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  addQuotedText: (text: string) => void;
  removeQuotedText: (id: string) => void;
  clearInput: () => void;
  clearAttachments: () => void;
  clear: () => void;
  setTextareaRef: (ref: RefObject<HTMLTextAreaElement | null>) => void;
  focusTextarea: () => void;
};

type QuotedText = {
  id: string;
  text: string;
};

const createQuotedTextId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const useComposerStore = create<ComposerState & ComposerActions>(
  (set, get) => ({
    input: "",
    pendingAttachments: [],
    uploading: false,
    quotedTexts: [],
    textareaRef: null,
    setInput: (value) => set({ input: value }),
    addAttachments: async (files) => {
      const items = Array.from(files || []);
      if (items.length === 0) {
        return;
      }

      set({ uploading: true });

      const attachments = await buildAttachmentsFromFiles(items);

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
    addQuotedText: (text) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      set((state) => ({
        quotedTexts: [
          ...state.quotedTexts,
          { id: createQuotedTextId(), text: trimmed },
        ],
      }));
    },
    removeQuotedText: (id) =>
      set((state) => ({
        quotedTexts: state.quotedTexts.filter((item) => item.id !== id),
      })),
    clearInput: () => set({ input: "" }),
    clearAttachments: () => set({ pendingAttachments: [] }),
    clear: () => {
      set({
        input: "",
        pendingAttachments: [],
        uploading: false,
        quotedTexts: [],
      });
    },
    setTextareaRef: (ref) => set({ textareaRef: ref }),
    focusTextarea: () => {
      const { textareaRef } = get();
      textareaRef?.current?.focus();
    },
  })
);
