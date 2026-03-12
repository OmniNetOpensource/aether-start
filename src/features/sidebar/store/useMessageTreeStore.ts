import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getAvailableModelsFn,
  getAvailablePromptsFn,
} from "@/server/functions/chat/models";
import type {
  AssistantMessage,
  BranchInfo,
  ContentBlock,
  Message,
} from "@/types/message";
import {
  addMessage,
  buildCurrentPath,
  computeMessagesFromPath,
  createEmptyMessageState,
  createLinearMessages,
  editMessage,
  getBranchInfo,
  normalizeMessageParentIds,
  switchBranch,
} from "@/lib/conversation/tree/message-tree";
import {
  applyAssistantAddition,
  type AssistantAddition,
} from "@/lib/conversation/tree/block-operations";

type TreeSnapshot = ReturnType<typeof createEmptyMessageState>;

export type RoleInfo = { id: string; name: string };

export type PromptInfo = { id: string; name: string };

const MODEL_STORAGE_KEY = "aether_current_role";
const PROMPT_STORAGE_KEY = "aether_current_prompt";

const getStoredValue = (key: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStoredValue = (key: string, value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export type MessageTreeSelectionState = {
  currentRole: string;
  availableRoles: RoleInfo[];
  rolesLoading: boolean;
  currentPrompt: string;
  availablePrompts: PromptInfo[];
  promptsLoading: boolean;
};

export const initialMessageTreeSelectionState: MessageTreeSelectionState = {
  currentRole: "",
  availableRoles: [],
  rolesLoading: false,
  currentPrompt: "",
  availablePrompts: [],
  promptsLoading: false,
};

type MessageTreeState = TreeSnapshot &
  MessageTreeSelectionState & {
  conversationId: string | null;
  };

type MessageTreeActions = {
  setMessages: (messages: Message[]) => void;
  initializeTree: (messages?: Message[], currentPath?: number[]) => void;
  getMessagesFromPath: () => Message[];
  setConversationId: (id: string | null) => void;
  selectMessage: (messageId: number) => void;
  appendToAssistant: (addition: AssistantAddition) => void;
  getBranchInfo: (messageId: number) => BranchInfo | null;
  navigateBranch: (
    messageId: number,
    depth: number,
    direction: "prev" | "next",
  ) => void;
  setCurrentRole: (role: string) => void;
  setAvailableRoles: (roles: RoleInfo[]) => void;
  setRolesLoading: (loading: boolean) => void;
  loadAvailableRoles: () => Promise<void>;
  setCurrentPrompt: (promptId: string) => void;
  setAvailablePrompts: (prompts: PromptInfo[]) => void;
  setPromptsLoading: (loading: boolean) => void;
  loadAvailablePrompts: () => Promise<void>;
  cyclePrompt: () => void;
  clear: () => void;
  getTreeState: () => TreeSnapshot;
  setTreeState: (partial: Partial<TreeSnapshot>) => void;
  addMessage: (
    role: Message["role"],
    blocks: ContentBlock[],
    createdAt?: string,
  ) => ReturnType<typeof addMessage>;
  editMessage: (
    depth: number,
    messageId: number,
    blocks: ContentBlock[],
  ) => ReturnType<typeof editMessage> | null;
};

export const useMessageTreeStore = create<
  MessageTreeState & MessageTreeActions
>()(
  devtools(
    (set, get) => ({
      ...createEmptyMessageState(),
      conversationId: null,
      ...initialMessageTreeSelectionState,
      setMessages: (messages) => {
        // Normalize to a linear tree so branch navigation works with simple lists.
        const linearState = createLinearMessages(
          messages.map((message) => ({
            role: message.role,
            blocks: message.blocks ?? [],
            createdAt: message.createdAt,
          })),
        );
        set(
          {
            messages: linearState.messages,
            currentPath: linearState.currentPath,
            latestRootId: linearState.latestRootId,
            nextId: linearState.nextId,
          },
          false,
          "setMessages",
        );
      },
      initializeTree: (messages = [], currentPath = []) => {
        const normalizedMessages = normalizeMessageParentIds(messages);
        const resolvedCurrentPath =
          Array.isArray(currentPath) &&
          currentPath.every((id) => typeof id === "number")
            ? currentPath
            : [];
        const fallbackRootId =
          normalizedMessages.length > 0 ? normalizedMessages[0].id : null;
        const nextPath =
          resolvedCurrentPath.length > 0
            ? resolvedCurrentPath
            : buildCurrentPath(normalizedMessages, fallbackRootId);
        const latestRootId = nextPath[0] ?? fallbackRootId;
        const nextId =
          normalizedMessages.reduce(
            (maxId, message) => Math.max(maxId, message.id),
            0,
          ) + 1;

        set(
          {
            messages: normalizedMessages,
            currentPath: nextPath,
            latestRootId,
            nextId,
          },
          false,
          "initializeTree",
        );
      },
      getMessagesFromPath: () =>
        computeMessagesFromPath(get().messages, get().currentPath),
      setConversationId: (id) =>
        set({ conversationId: id }, false, "setConversationId"),
      selectMessage: (messageId) => {
        const state = get();
        const targetPath: number[] = [];
        const visited = new Set<number>();
        let currentId: number | null = messageId;

        while (currentId !== null) {
          if (visited.has(currentId)) {
            return;
          }

          const currentMessage: Message | undefined =
            state.messages[currentId - 1];
          if (!currentMessage) {
            return;
          }

          targetPath.push(currentId);
          visited.add(currentId);
          currentId = currentMessage.parentId;
        }

        targetPath.reverse();

        let nextState = state.getTreeState();
        for (let index = 0; index < targetPath.length; index += 1) {
          nextState = switchBranch(nextState, index + 1, targetPath[index]);
        }

        set(
          {
            messages: nextState.messages,
            currentPath: nextState.currentPath,
            latestRootId: nextState.latestRootId,
            nextId: nextState.nextId,
          },
          false,
          "selectMessage",
        );
      },
      clear: () => {
        const state = get();
        set(
          {
            ...createEmptyMessageState(),
            conversationId: null,
            currentRole: state.currentRole,
            availableRoles: state.availableRoles,
            rolesLoading: state.rolesLoading,
            currentPrompt: state.currentPrompt,
            availablePrompts: state.availablePrompts,
            promptsLoading: state.promptsLoading,
          },
          false,
          "clear",
        );
      },
      setCurrentRole: (currentRole) => {
        set({ currentRole }, false, "setCurrentRole");

        if (currentRole) {
          setStoredValue(MODEL_STORAGE_KEY, currentRole);
        }
      },
      setAvailableRoles: (availableRoles) =>
        set({ availableRoles }, false, "setAvailableRoles"),
      setRolesLoading: (rolesLoading) =>
        set({ rolesLoading }, false, "setRolesLoading"),
      loadAvailableRoles: async () => {
        const state = get();
        if (state.availableRoles.length > 0 || state.rolesLoading) {
          return;
        }

        set({ rolesLoading: true }, false, "loadAvailableRoles/start");

        try {
          const roles = await getAvailableModelsFn();
          const firstId = roles[0]?.id ?? "";
          const stored = getStoredValue(MODEL_STORAGE_KEY);
          const storedValid = stored && roles.some((role) => role.id === stored);
          const roleToUse = storedValid ? stored : firstId;

          if (roleToUse) {
            get().setCurrentRole(roleToUse);
          }

          set({ availableRoles: roles }, false, "loadAvailableRoles/success");
        } catch {
          // ignore
        } finally {
          set({ rolesLoading: false }, false, "loadAvailableRoles/finish");
        }
      },
      setCurrentPrompt: (currentPrompt) => {
        set({ currentPrompt }, false, "setCurrentPrompt");

        if (currentPrompt) {
          setStoredValue(PROMPT_STORAGE_KEY, currentPrompt);
        }
      },
      setAvailablePrompts: (availablePrompts) =>
        set({ availablePrompts }, false, "setAvailablePrompts"),
      setPromptsLoading: (promptsLoading) =>
        set({ promptsLoading }, false, "setPromptsLoading"),
      loadAvailablePrompts: async () => {
        const state = get();
        if (state.availablePrompts.length > 0 || state.promptsLoading) {
          return;
        }

        set({ promptsLoading: true }, false, "loadAvailablePrompts/start");

        try {
          const prompts = await getAvailablePromptsFn();
          const firstId = prompts[0]?.id ?? "aether";
          const stored = getStoredValue(PROMPT_STORAGE_KEY);
          const storedValid = stored && prompts.some((prompt) => prompt.id === stored);
          const promptToUse = storedValid ? stored : firstId;

          if (promptToUse) {
            get().setCurrentPrompt(promptToUse);
          }

          set(
            { availablePrompts: prompts },
            false,
            "loadAvailablePrompts/success",
          );
        } catch {
          // ignore
        } finally {
          set({ promptsLoading: false }, false, "loadAvailablePrompts/finish");
        }
      },
      cyclePrompt: () => {
        const state = get();
        if (state.availablePrompts.length === 0) {
          return;
        }

        const currentIndex = state.availablePrompts.findIndex(
          (prompt) => prompt.id === state.currentPrompt,
        );
        const nextIndex =
          currentIndex < 0 ? 0 : (currentIndex + 1) % state.availablePrompts.length;
        get().setCurrentPrompt(state.availablePrompts[nextIndex].id);
      },
      getTreeState: () => {
        const state = get();
        return {
          messages: state.messages,
          currentPath: state.currentPath,
          latestRootId: state.latestRootId,
          nextId: state.nextId,
        };
      },
      setTreeState: (partial) =>
        set(
          (state) => ({
            messages: partial.messages
              ? normalizeMessageParentIds(partial.messages)
              : state.messages,
            currentPath: partial.currentPath ?? state.currentPath,
            latestRootId: partial.latestRootId ?? state.latestRootId,
            nextId: partial.nextId ?? state.nextId,
          }),
          false,
          "setTreeState",
        ),
      addMessage: (role, blocks, createdAt) => {
        const result = addMessage(
          get().getTreeState(),
          role,
          blocks,
          createdAt,
        );
        set(
          {
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          },
          false,
          "addMessage",
        );
        return result;
      },
      editMessage: (depth, messageId, blocks) => {
        const result = editMessage(
          get().getTreeState(),
          depth,
          messageId,
          blocks,
        );
        if (!result) {
          return null;
        }
        set(
          {
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          },
          false,
          "editMessage",
        );
        return result;
      },
      getBranchInfo: (messageId) => getBranchInfo(get().messages, messageId),
      navigateBranch: (messageId, depth, direction) => {
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
          targetId,
        );

        set(
          {
            messages: nextState.messages,
            currentPath: nextState.currentPath,
            latestRootId: nextState.latestRootId,
            nextId: nextState.nextId,
          },
          false,
          "navigateBranch",
        );
      },
      appendToAssistant: (addition) =>
        set(
          (state) => {
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
                [],
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

            const targetMessage = nextMessages[
              assistantId - 1
            ] as AssistantMessage;
            const updatedMessage: AssistantMessage = {
              ...targetMessage,
              blocks: applyAssistantAddition(
                targetMessage.blocks ?? [],
                addition,
              ),
            };

            const updatedMessages = [...nextMessages];
            updatedMessages[assistantId - 1] = updatedMessage;

            return {
              messages: updatedMessages,
              currentPath: nextPath,
              latestRootId: nextLatestRootId,
              nextId,
            };
          },
          false,
          "appendToAssistant",
        ),
    }),
    { name: "MessageTreeStore" },
  ),
);

export const useIsNewChat = () =>
  useMessageTreeStore(
    (state) => state.conversationId === null && state.messages.length === 0,
  );
