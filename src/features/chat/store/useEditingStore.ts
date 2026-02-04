import { create } from "zustand";
import type { Attachment, EditingState } from "@/src/features/chat/types/chat";
import { toast } from "@/src/hooks/useToast";
import {
  buildUserBlocks,
  cloneBlocks,
  computeMessagesFromPath,
  editMessage,
  extractAttachmentsFromBlocks,
  extractContentFromBlocks,
} from "@/src/features/chat/lib/tree";
import { startChatRequest } from "@/src/features/chat/lib/network";
import { useMessageTreeStore } from "./useMessageTreeStore";
import { getChatRequestHandlers, useChatRequestStore } from "./useChatRequestStore";

type EditingStoreState = {
  editingState: EditingState | null;
};

type EditingStoreActions = {
  startEditing: (messageId: number) => void;
  updateEditContent: (content: string) => void;
  updateEditAttachments: (attachments: Attachment[]) => void;
  cancelEditing: () => void;
  submitEdit: (depth: number, navigate?: (path: string) => void) => Promise<void>;
  retryFromMessage: (
    messageId: number,
    depth: number,
    navigate?: (path: string) => void
  ) => Promise<void>;
  clear: () => void;
};

export const useEditingStore = create<EditingStoreState & EditingStoreActions>(
  (set, get) => ({
    editingState: null,
    startEditing: (messageId) => {
      const messages = useMessageTreeStore.getState().messages;
      const target = messages[messageId - 1];
      if (!target || target.role !== "user") {
        return;
      }

      const originalBlocks = cloneBlocks(target.blocks ?? []);
      const editedContent = extractContentFromBlocks(originalBlocks);
      const editedAttachments = extractAttachmentsFromBlocks(originalBlocks).map(
        (attachment) => ({ ...attachment })
      );

      set({
        editingState: {
          messageId,
          originalBlocks,
          editedContent,
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
    submitEdit: async (depth, navigate) => {
      const editingState = get().editingState;
      if (!editingState) {
        return;
      }

      const selectedRole = useChatRequestStore.getState().currentRole;
      if (!selectedRole) {
        toast.warning("请先选择角色");
        return;
      }

      const requestStore = useChatRequestStore.getState();
      if (requestStore.pending) {
        requestStore.stop();
      }

      const trimmed = editingState.editedContent.trim();
      const attachments = editingState.editedAttachments;
      if (!trimmed && attachments.length === 0) {
        toast.warning("请输入内容或添加附件");
        return;
      }

      const treeStore = useMessageTreeStore.getState();
      const result = editMessage(
        treeStore._getTreeState(),
        depth,
        editingState.messageId,
        buildUserBlocks(editingState.editedContent, attachments)
      );

      if (!result) {
        set({ editingState: null });
        return;
      }

      treeStore._setTreeState({
        messages: result.messages,
        currentPath: result.currentPath,
        latestRootId: result.latestRootId,
        nextId: result.nextId,
      });
      set({ editingState: null });

      const pathMessages = computeMessagesFromPath(
        result.messages,
        result.currentPath
      );

      const { get: getRequestState, set: setRequestState } =
        getChatRequestHandlers();

      await startChatRequest(getRequestState, setRequestState, {
        messages: pathMessages,
        navigate,
        titleSource: { role: "user", blocks: result.addedMessage.blocks },
      });
    },
    retryFromMessage: async (messageId, depth, navigate) => {
      const treeStore = useMessageTreeStore.getState();
      const treeState = treeStore._getTreeState();
      const targetNode = treeState.messages[messageId - 1];
      if (!targetNode) {
        return;
      }

      const selectedRole = useChatRequestStore.getState().currentRole;
      if (!selectedRole) {
        toast.warning("请先选择角色");
        return;
      }

      const requestStore = useChatRequestStore.getState();
      if (requestStore.pending) {
        requestStore.stop();
      }

      if (targetNode.role === "user") {
        const result = editMessage(
          treeState,
          depth,
          messageId,
          cloneBlocks(targetNode.blocks ?? [])
        );

        if (!result) {
          return;
        }

        treeStore._setTreeState({
          messages: result.messages,
          currentPath: result.currentPath,
          latestRootId: result.latestRootId,
          nextId: result.nextId,
        });
        set({ editingState: null });

        const pathMessages = computeMessagesFromPath(
          result.messages,
          result.currentPath
        );

        const { get: getRequestState, set: setRequestState } =
          getChatRequestHandlers();

        await startChatRequest(getRequestState, setRequestState, {
          messages: pathMessages,
          navigate,
          titleSource: { role: "user", blocks: result.addedMessage.blocks },
        });
        return;
      }

      // For assistant nodes, rewind to the parent user message and regenerate.
      const nextPath = treeState.currentPath.slice(0, Math.max(depth - 1, 0));
      if (nextPath.length === 0) {
        return;
      }

      treeStore._setTreeState({ currentPath: nextPath });
      set({ editingState: null });

      const pathMessages = computeMessagesFromPath(treeState.messages, nextPath);
      const titleSource =
        [...pathMessages].reverse().find((message) => message.role === "user") ??
        pathMessages[0];

      const { get: getRequestState, set: setRequestState } =
        getChatRequestHandlers();

      await startChatRequest(getRequestState, setRequestState, {
        messages: pathMessages,
        navigate,
        titleSource,
      });
    },
    clear: () => set({ editingState: null }),
  })
);
