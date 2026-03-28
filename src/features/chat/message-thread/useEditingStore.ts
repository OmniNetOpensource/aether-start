import { create } from 'zustand';
import { useChatRequestStore } from '@/features/chat/session';
import { toast } from '@/shared/app-shell/useToast';
import { startChatRequest, cancelAnswering } from '@/features/chat/session';
import { cloneBlocks, editMessage } from '@/features/conversations/conversation-tree';
import {
  buildUserBlocks,
  extractAttachmentsFromBlocks,
  extractContentFromBlocks,
  extractQuotesFromBlocks,
} from '@/features/conversations/conversation-tree';
import { useChatSessionStore } from '@/features/conversations/session';
import type { Attachment, UserContentBlock } from '@/features/chat/message-thread';

type EditingState = {
  messageId: number;
  originalBlocks: UserContentBlock[];
  editedContent: string;
  editedQuotes: { id: string; text: string }[];
  editedAttachments: Attachment[];
};

type EditingStoreState = {
  editingState: EditingState | null;
};

type EditingStoreActions = {
  startEditing: (messageId: number) => void;
  updateEditContent: (content: string) => void;
  updateEditQuotes: (quotes: { id: string; text: string }[]) => void;
  updateEditAttachments: (attachments: Attachment[]) => void;
  cancelEditing: () => void;
  submitEdit: (depth: number) => Promise<void>;
  retryFromMessage: (messageId: number, depth: number) => Promise<void>;
  clear: () => void;
};

export const useEditingStore = create<EditingStoreState & EditingStoreActions>()((set, get) => ({
  editingState: null,
  startEditing: (messageId) => {
    const messages = useChatSessionStore.getState().messages;
    const target = messages[messageId - 1];
    if (!target || target.role !== 'user') {
      return;
    }

    const originalBlocks = cloneBlocks(target.blocks ?? []) as UserContentBlock[];
    const editedContent = extractContentFromBlocks(originalBlocks);
    const editedQuotes = extractQuotesFromBlocks(originalBlocks).map((q) => ({ ...q }));
    const editedAttachments = extractAttachmentsFromBlocks(originalBlocks).map((attachment) => ({
      ...attachment,
    }));

    set({
      editingState: {
        messageId,
        originalBlocks,
        editedContent,
        editedQuotes,
        editedAttachments,
      },
    });
  },
  updateEditContent: (content) =>
    set((state) => {
      if (!state.editingState) {
        return state;
      }
      return {
        editingState: {
          ...state.editingState,
          editedContent: content,
        },
      };
    }),
  updateEditQuotes: (quotes) =>
    set((state) => {
      if (!state.editingState) {
        return state;
      }
      return {
        editingState: {
          ...state.editingState,
          editedQuotes: quotes,
        },
      };
    }),
  updateEditAttachments: (attachments) =>
    set((state) => {
      if (!state.editingState) {
        return state;
      }
      return {
        editingState: {
          ...state.editingState,
          editedAttachments: attachments,
        },
      };
    }),
  cancelEditing: () => set({ editingState: null }),
  submitEdit: async (depth) => {
    const editingState = get().editingState;
    if (!editingState) {
      return;
    }

    const selectedModel = useChatSessionStore.getState().currentModelId;
    if (!selectedModel) {
      toast.warning('请先选择模型');
      return;
    }

    if (useChatRequestStore.getState().status !== 'idle') {
      cancelAnswering('useEditingStore/submitEdit');
    }

    const trimmed = editingState.editedContent.trim();
    const quotes = editingState.editedQuotes;
    const attachments = editingState.editedAttachments;
    if (!trimmed && quotes.length === 0 && attachments.length === 0) {
      toast.warning('请输入内容或添加附件');
      return;
    }

    const treeStore = useChatSessionStore.getState();
    const result = editMessage(
      treeStore.getTreeState(),
      depth,
      editingState.messageId,
      buildUserBlocks(editingState.editedContent, quotes, attachments),
    );

    if (!result) {
      set({ editingState: null });
      return;
    }

    treeStore.setTreeState({
      messages: result.messages,
      currentPath: result.currentPath,
      latestRootId: result.latestRootId,
      nextId: result.nextId,
    });
    set({ editingState: null });

    await startChatRequest();
  },
  retryFromMessage: async (messageId, depth) => {
    const treeStore = useChatSessionStore.getState();
    const treeState = treeStore.getTreeState();
    const targetNode = treeState.messages[messageId - 1];
    if (!targetNode) {
      return;
    }

    const selectedModel = useChatSessionStore.getState().currentModelId;
    if (!selectedModel) {
      toast.warning('请先选择模型');
      return;
    }

    if (useChatRequestStore.getState().status !== 'idle') {
      cancelAnswering('useEditingStore/retryFromMessage');
    }

    if (targetNode.role === 'user') {
      const result = editMessage(treeState, depth, messageId, cloneBlocks(targetNode.blocks ?? []));

      if (!result) {
        return;
      }

      treeStore.setTreeState({
        messages: result.messages,
        currentPath: result.currentPath,
        latestRootId: result.latestRootId,
        nextId: result.nextId,
      });
      set({ editingState: null });

      await startChatRequest();
      return;
    }

    // For assistant nodes, rewind to the parent user message and regenerate.
    const nextPath = treeState.currentPath.slice(0, Math.max(depth - 1, 0));
    if (nextPath.length === 0) {
      return;
    }

    treeStore.setTreeState({ currentPath: nextPath });
    set({ editingState: null });

    await startChatRequest();
  },
  clear: () => set({ editingState: null }),
}));
