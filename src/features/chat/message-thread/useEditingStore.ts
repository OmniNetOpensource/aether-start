import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useChatRequestStore } from '@/features/chat/composer/composer-request/useChatRequestStore';
import { toast } from '@/shared/app-shell/useToast';
import { cancelAnswering, startChatRequest } from '@/features/chat/agent-runtime/chat-orchestrator';
import { cloneBlocks, editMessage } from '@/features/conversations/conversation-tree';
import {
  composerDocumentFromBlocks,
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
  type ComposerDocument,
} from '@/features/chat/composer/composer-editor/composer-document';
import { useChatSessionStore } from '@/features/conversations/session';
import { getZustandDevtoolsOptions } from '@/shared/browser/zustand-devtools';

type EditingState = {
  messageId: number;
  editedDocument: ComposerDocument;
};

type EditingStoreState = {
  editingState: EditingState | null;
};

type EditingStoreActions = {
  startEditing: (messageId: number) => void;
  updateEditDocument: (document: ComposerDocument) => void;
  cancelEditing: () => void;
  submitEdit: (depth: number) => Promise<void>;
  retryFromMessage: (messageId: number, depth: number) => Promise<void>;
  clear: () => void;
};

export const useEditingStore = create<EditingStoreState & EditingStoreActions>()(
  devtools(
    (set, get) => ({
      editingState: null,
      startEditing: (messageId) => {
        const messages = useChatSessionStore.getState().messages;
        const target = messages[messageId - 1];
        if (!target || target.role !== 'user') {
          return;
        }

        set({
          editingState: {
            messageId,
            editedDocument: composerDocumentFromBlocks(target.blocks),
          },
        });
      },
      updateEditDocument: (document) =>
        set((state) => {
          if (!state.editingState) {
            return state;
          }
          return {
            editingState: {
              ...state.editingState,
              editedDocument: document,
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
          await cancelAnswering('useEditingStore/submitEdit');
        }

        if (isComposerDocumentEmpty(editingState.editedDocument)) {
          toast.warning('请输入内容或添加附件');
          return;
        }

        const treeStore = useChatSessionStore.getState();
        const result = editMessage(
          treeStore.getTreeState(),
          depth,
          editingState.messageId,
          composerDocumentToBlocks(editingState.editedDocument),
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
        const selectedModel = useChatSessionStore.getState().currentModelId;
        if (!selectedModel) {
          toast.warning('请先选择模型');
          return;
        }

        if (useChatRequestStore.getState().status !== 'idle') {
          await cancelAnswering('useEditingStore/retryFromMessage');
        }

        const treeStore = useChatSessionStore.getState();
        const treeState = treeStore.getTreeState();
        const targetNode = treeState.messages[messageId - 1];
        if (!targetNode) {
          return;
        }

        if (targetNode.role === 'user') {
          const result = editMessage(
            treeState,
            depth,
            messageId,
            cloneBlocks(targetNode.blocks ?? []),
          );

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
    }),
    getZustandDevtoolsOptions('EditingStore'),
  ),
);
