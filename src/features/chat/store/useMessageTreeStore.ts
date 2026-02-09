import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  BranchInfo,
  ContentBlock,
  Message,
} from "@/features/chat/types/chat";
import {
  addMessage,
  buildCurrentPath,
  cloneBlocks,
  computeMessagesFromPath,
  createEmptyMessageState,
  createLinearMessages,
  editMessage,
  getBranchInfo,
  switchBranch,
} from "@/features/chat/lib/tree/message-tree";
import {
  applyAssistantAddition,
  cloneMessages,
  type AssistantAddition,
} from "@/features/chat/lib/tree/block-operations";
import { buildConversationTitle } from "@/features/chat/lib/format";
import { localDB } from "@/shared/lib/storage/indexed-db/conversations";
import { useConversationsStore } from "@/features/sidebar/store/useConversationsStore";
import { useChatRequestStore } from "./useChatRequestStore";

type TreeSnapshot = ReturnType<typeof createEmptyMessageState>;

type MessageTreeState = TreeSnapshot & {
  conversationId: string | null;
};

type MessageTreeActions = {
  setMessages: (messages: Message[]) => void;
  initializeTree: (messages?: Message[], currentPath?: number[]) => void;
  getMessagesFromPath: () => Message[];
  setConversationId: (id: string | null) => void;
  appendToAssistant: (addition: AssistantAddition) => void;
  getBranchInfo: (messageId: number) => BranchInfo | null;
  navigateBranch: (
    messageId: number,
    depth: number,
    direction: "prev" | "next"
  ) => void;
  branchToNewConversation: (
    messageId: number,
    navigate: (path: string) => void
  ) => Promise<void>;
  clear: () => void;
  _getTreeState: () => TreeSnapshot;
  _setTreeState: (partial: Partial<TreeSnapshot>) => void;
  _addMessage: (
    role: Message["role"],
    blocks: ContentBlock[],
    createdAt?: string
  ) => ReturnType<typeof addMessage>;
  _editMessage: (
    depth: number,
    messageId: number,
    blocks: ContentBlock[]
  ) => ReturnType<typeof editMessage> | null;
};

// Create a stable-ish client id without requiring a backend.
const generateConversationId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const useMessageTreeStore = create<MessageTreeState & MessageTreeActions>()(
  devtools(
    (set, get) => ({
      ...createEmptyMessageState(),
      conversationId: null,
      setMessages: (messages) => {
        // Normalize to a linear tree so branch navigation works with simple lists.
        const linearState = createLinearMessages(
          messages.map((message) => ({
            role: message.role,
            blocks: message.blocks ?? [],
            createdAt: message.createdAt,
          }))
        );
        set({
          messages: linearState.messages,
          currentPath: linearState.currentPath,
          latestRootId: linearState.latestRootId,
          nextId: linearState.nextId,
        });
      },
      initializeTree: (messages = [], currentPath = []) => {
        const resolvedCurrentPath =
          Array.isArray(currentPath) &&
          currentPath.every((id) => typeof id === "number")
            ? currentPath
            : [];
        const fallbackRootId = messages.length > 0 ? messages[0].id : null;
        const nextPath =
          resolvedCurrentPath.length > 0
            ? resolvedCurrentPath
            : buildCurrentPath(messages, fallbackRootId);
        const latestRootId = nextPath[0] ?? fallbackRootId;
        const nextId =
          messages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1;

        set({
          messages,
          currentPath: nextPath,
          latestRootId,
          nextId,
        });
      },
      getMessagesFromPath: () =>
        computeMessagesFromPath(get().messages, get().currentPath),
      setConversationId: (id) => set({ conversationId: id }),
      clear: () => {
        set({
          ...createEmptyMessageState(),
          conversationId: null,
        });
      },
      _getTreeState: () => {
        const state = get();
        return {
          messages: state.messages,
          currentPath: state.currentPath,
          latestRootId: state.latestRootId,
          nextId: state.nextId,
        };
      },
      _setTreeState: (partial) =>
        set((state) => ({
          messages: partial.messages ?? state.messages,
          currentPath: partial.currentPath ?? state.currentPath,
          latestRootId: partial.latestRootId ?? state.latestRootId,
          nextId: partial.nextId ?? state.nextId,
        })),
      _addMessage: (role, blocks, createdAt) => {
        const result = addMessage(get()._getTreeState(), role, blocks, createdAt);
        set({
          messages: result.messages,
          currentPath: result.currentPath,
          latestRootId: result.latestRootId,
          nextId: result.nextId,
        });
        return result;
      },
      _editMessage: (depth, messageId, blocks) => {
        const result = editMessage(get()._getTreeState(), depth, messageId, blocks);
        if (!result) {
          return null;
        }
        set({
          messages: result.messages,
          currentPath: result.currentPath,
          latestRootId: result.latestRootId,
          nextId: result.nextId,
        });
        return result;
      },
      getBranchInfo: (messageId) => getBranchInfo(get().messages, messageId),
      navigateBranch: (messageId, depth, direction) => {
        if (useChatRequestStore.getState().pending) {
          return;
        }

        const state = get();
        const info = getBranchInfo(state.messages, messageId);
        if (!info) {
          return;
        }

        const nextIndex =
          direction === "prev" ? info.currentIndex - 1 : info.currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= info.total) {
          return;
        }

        const targetId = info.siblingIds[nextIndex];
        const nextState = switchBranch(
          {
            messages: state.messages,
            currentPath: state.currentPath,
            latestRootId: state.latestRootId,
            nextId: state.nextId,
          },
          depth,
          targetId
        );

        set({
          messages: nextState.messages,
          currentPath: nextState.currentPath,
          latestRootId: nextState.latestRootId,
          nextId: nextState.nextId,
        });
      },
      appendToAssistant: (addition) =>
        set((state) => {
          const currentPath = state.currentPath;
          const lastId = currentPath[currentPath.length - 1] ?? null;
          const lastMessage = lastId ? state.messages[lastId - 1] : null;

          let nextMessages = state.messages;
          let nextPath = state.currentPath;
          let nextLatestRootId = state.latestRootId;
          let nextId = state.nextId;
          let assistantId = lastId;

          if (!lastMessage || lastMessage.role !== "assistant") {
            // Ensure we have a target assistant message to append streaming blocks.
            const result = addMessage(
              {
                messages: state.messages,
                currentPath: state.currentPath,
                latestRootId: state.latestRootId,
                nextId: state.nextId,
              },
              "assistant",
              []
            );
            nextMessages = result.messages;
            nextPath = result.currentPath;
            nextLatestRootId = result.latestRootId;
            nextId = result.nextId;
            assistantId = result.addedMessage.id;
          }

          if (!assistantId || !nextMessages[assistantId - 1]) {
            return state;
          }

          const targetMessage = nextMessages[assistantId - 1];
          const updatedMessage: Message = {
            ...targetMessage,
            blocks: applyAssistantAddition(targetMessage.blocks ?? [], addition),
          };

          const updatedMessages = [...nextMessages];
          updatedMessages[assistantId - 1] = updatedMessage;

          return {
            messages: updatedMessages,
            currentPath: nextPath,
            latestRootId: nextLatestRootId,
            nextId,
          };
        }),
      branchToNewConversation: async (messageId, navigate) => {
        const state = get();
        const currentPath = state.currentPath;
        const targetIndex = currentPath.indexOf(messageId);
        if (targetIndex === -1) {
          return;
        }

        const requestState = useChatRequestStore.getState();
        if (requestState.pending) {
          requestState.stop();
        }

        const pathIds = currentPath.slice(0, targetIndex + 1);
        const pathMessages = pathIds
          .map((id) => state.messages[id - 1])
          .filter((message): message is Message => !!message);

        if (pathMessages.length === 0) {
          return;
        }

        // Copy the path into a new linear conversation to preserve history.
        const linearState = createLinearMessages(
          pathMessages.map((message) => ({
            role: message.role,
            blocks: cloneBlocks(message.blocks ?? []),
            createdAt: message.createdAt,
          }))
        );

        const newConversationId = generateConversationId();
        const now = new Date().toISOString();
        const titleSource =
          pathMessages.find((message) => message.role === "user") ??
          pathMessages[0];
        const title = titleSource
          ? buildConversationTitle(titleSource)
          : "新会话";

        await localDB.save({
          id: newConversationId,
          title,
          currentPath: linearState.currentPath,
          messages: cloneMessages(linearState.messages),
          created_at: now,
          updated_at: now,
        });

        const { addConversation } = useConversationsStore.getState();
        addConversation({
          id: newConversationId,
          title,
          user_id: "",
          created_at: now,
          updated_at: now,
        });

        navigate(`/app/c/${newConversationId}`);
      },
    }),
    { name: "MessageTreeStore" }
  )
);

export const useIsNewChat = () =>
  useMessageTreeStore(
    (state) => state.conversationId === null && state.messages.length === 0
  );
