import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { toast } from "@/hooks/useToast";
import { startChatRequest, stopActiveChatRequest } from "@/lib/chat/api/chat-orchestrator";
import {
  cloneBlocks,
  computeMessagesFromPath,
  editMessage,
} from "@/lib/conversation/tree/message-tree";
import {
  buildUserBlocks,
  extractAttachmentsFromBlocks,
  extractContentFromBlocks,
} from "@/lib/conversation/tree/block-operations";
import { useChatSessionStore } from '@/stores/zustand/useChatSessionStore'
import type { Attachment, UserContentBlock } from "@/types/message";

type EditingState = {
  messageId: number;
  originalBlocks: UserContentBlock[];
  editedContent: string;
  editedAttachments: Attachment[];
};

type EditingStoreState = {
  editingState: EditingState | null;
};

type EditingStoreActions = {
  startEditing: (messageId: number) => void;
  updateEditContent: (content: string) => void;
  updateEditAttachments: (attachments: Attachment[]) => void;
  cancelEditing: () => void;
  submitEdit: (depth: number) => Promise<void>;
  retryFromMessage: (
    messageId: number,
    depth: number,
  ) => Promise<void>;
  clear: () => void;
};

export const useEditingStore = create<EditingStoreState & EditingStoreActions>()(
  devtools((set, get) => ({
      editingState: null,
      startEditing: (messageId) => {
        const messages = useChatSessionStore.getState().messages;
        const target = messages[messageId - 1];
        if (!target || target.role !== "user") {
          return;
        }

        const originalBlocks = cloneBlocks(target.blocks ?? []) as UserContentBlock[];
        const editedContent = extractContentFromBlocks(originalBlocks);
        const editedAttachments = extractAttachmentsFromBlocks(originalBlocks).map(
          (attachment) => ({ ...attachment })
        );

        set(
          {
            editingState: {
              messageId,
              originalBlocks,
              editedContent,
              editedAttachments,
            },
          },
          false,
          "startEditing"
        );
      },
      updateEditContent: (content) =>
        set(
          (state) => {
            if (!state.editingState) {
              return state;
            }
            return {
              editingState: {
                ...state.editingState,
                editedContent: content,
              },
            };
          },
          false,
          "updateEditContent"
        ),
      updateEditAttachments: (attachments) =>
        set(
          (state) => {
            if (!state.editingState) {
              return state;
            }

            return {
              editingState: {
                ...state.editingState,
                editedAttachments: attachments,
              },
            };
          },
          false,
          "updateEditAttachments"
        ),
      cancelEditing: () => set({ editingState: null }, false, "cancelEditing"),
      submitEdit: async (depth) => {
        const editingState = get().editingState;
        if (!editingState) {
          return;
        }

        const selectedRole = useChatSessionStore.getState().currentRole;
        if (!selectedRole) {
          toast.warning('请先选择角色');
          return;
        }

        if (useChatRequestStore.getState().status !== "idle") {
          stopActiveChatRequest();
        }

        const trimmed = editingState.editedContent.trim();
        const attachments = editingState.editedAttachments;
        if (!trimmed && attachments.length === 0) {
          toast.warning('请输入内容或添加附件');
          return;
        }

        const treeStore = useChatSessionStore.getState();
        const result = editMessage(
          treeStore.getTreeState(),
          depth,
          editingState.messageId,
          buildUserBlocks(editingState.editedContent, attachments)
        );

        if (!result) {
          set({ editingState: null }, false, "submitEdit/reset");
          return;
        }

        treeStore.setTreeState({
          messages: result.messages,
          currentPath: result.currentPath,
          latestRootId: result.latestRootId,
          nextId: result.nextId,
        });
        set({ editingState: null }, false, "submitEdit/success");

        const pathMessages = computeMessagesFromPath(
          result.messages,
          result.currentPath
        );

        await startChatRequest({ messages: pathMessages });
      },
      retryFromMessage: async (messageId, depth) => {
        const treeStore = useChatSessionStore.getState();
        const treeState = treeStore.getTreeState();
        const targetNode = treeState.messages[messageId - 1];
        if (!targetNode) {
          return;
        }

        const selectedRole = useChatSessionStore.getState().currentRole;
        if (!selectedRole) {
          toast.warning('请先选择角色');
          return;
        }

        if (useChatRequestStore.getState().status !== "idle") {
          stopActiveChatRequest();
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

          treeStore.setTreeState({
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          });
          set({ editingState: null }, false, "retryFromMessage/user");

          const pathMessages = computeMessagesFromPath(
            result.messages,
            result.currentPath
          );

          await startChatRequest({ messages: pathMessages });
          return;
        }

        // For assistant nodes, rewind to the parent user message and regenerate.
        const nextPath = treeState.currentPath.slice(0, Math.max(depth - 1, 0));
        if (nextPath.length === 0) {
          return;
        }

        treeStore.setTreeState({ currentPath: nextPath });
        set({ editingState: null }, false, "retryFromMessage/assistant");

        const pathMessages = computeMessagesFromPath(treeState.messages, nextPath);

        await startChatRequest({ messages: pathMessages });
      },
      clear: () => set({ editingState: null }, false, "clear"),
    }),
    { name: "EditingStore" })
);
