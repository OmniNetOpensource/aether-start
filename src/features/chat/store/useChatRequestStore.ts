import { create } from "zustand";
import { toast } from "@/src/hooks/useToast";
import type { ChatClient } from "@/src/features/chat/lib/network";
import { startChatRequest } from "@/src/features/chat/lib/network";
import { DEFAULT_ROLE_ID, ROLES } from "@/src/features/chat/config/roles";
import {
  buildUserBlocks,
  cloneMessages,
  computeMessagesFromPath,
} from "@/src/features/chat/lib/tree";
import type { Message } from "@/src/features/chat/types/chat";
import { buildConversationTitle } from "@/src/features/chat/lib/format";
import { localDB } from "@/src/lib/storage/indexed-db";
import { useConversationsStore } from "@/src/features/sidebar/store/useConversationsStore";
import { useComposerStore } from "./useComposerStore";
import { useMessageTreeStore } from "./useMessageTreeStore";

type ChatRequestState = {
  pending: boolean;
  chatClient: ChatClient | null;
  activeRequestId: string | null;
  currentRole: string;
};

type ChatRequestActions = {
  sendMessage: (navigate?: (path: string) => void) => Promise<void>;
  stop: () => void;
  setCurrentRole: (role: string) => void;
  clear: () => void;
  _setPending: (pending: boolean) => void;
  _setChatClient: (client: ChatClient | null) => void;
  _setActiveRequestId: (id: string | null) => void;
};

const ROLE_STORAGE_KEY = "selected-role";
const getInitialRole = (): string => {
  if (typeof window === "undefined") {
    return DEFAULT_ROLE_ID;
  }

  const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
  if (stored && ROLES.some((role) => role.id === stored)) {
    return stored;
  }

  if (ROLES.some((role) => role.id === DEFAULT_ROLE_ID)) {
    return DEFAULT_ROLE_ID;
  }

  return ROLES[0]?.id ?? "";
};

const persistConversation = async (
  id: string,
  messages: Message[],
  currentPath: number[]
) => {
  const now = new Date().toISOString();
  const existing = await localDB.get(id);
  const allMessages = cloneMessages(messages);
  const resolvedCurrentPath =
    currentPath.length > 0 ? currentPath : existing?.currentPath ?? [];
  const pathMessages = computeMessagesFromPath(messages, resolvedCurrentPath);
  const { pinnedConversations, normalConversations } =
    useConversationsStore.getState();
  const storedConversation = [
    ...pinnedConversations,
    ...normalConversations,
  ].find((item) => item.id === id);
  const pinned = storedConversation?.pinned ?? existing?.pinned;
  const pinned_at = storedConversation?.pinned_at ?? existing?.pinned_at;
  const titleSource =
    pathMessages.find((message) => message.role === "user") ??
    pathMessages[0];
  const title =
    existing?.title ??
    (titleSource ? buildConversationTitle(titleSource) : "New Chat");
  const created_at = existing?.created_at ?? now;

  await localDB.save({
    id,
    title,
    currentPath: resolvedCurrentPath,
    messages: allMessages,
    created_at,
    updated_at: now,
    pinned,
    pinned_at,
  });

};

export const useChatRequestStore = create<ChatRequestState & ChatRequestActions>(
  (set, get) => ({
    pending: false,
    chatClient: null,
    activeRequestId: null,
    currentRole: getInitialRole(),
    sendMessage: async (navigate) => {
      const { input, pendingAttachments, quotedTexts } =
        useComposerStore.getState();
      const trimmed = input.trim();
      const selectedRole = get().currentRole;

      if (get().pending) {
        return;
      }
      if (!trimmed && pendingAttachments.length === 0 && quotedTexts.length === 0) {
        return;
      }
      if (!selectedRole) {
        toast.warning("请先选择角色");
        return;
      }

      let finalInput = input;
      if (quotedTexts.length > 0) {
        const quotedBlocks = quotedTexts
          .map((quote) =>
            quote.text
              .split(/\r?\n/)
              .map((line) => `> ${line}`)
              .join("\n")
          )
          .join("\n\n");
        finalInput = trimmed ? `${quotedBlocks}\n\n${input}` : quotedBlocks;
      }

      const treeStore = useMessageTreeStore.getState();
      const result = treeStore._addMessage(
        "user",
        buildUserBlocks(finalInput, pendingAttachments)
      );

      const pathMessages = computeMessagesFromPath(
        result.messages,
        result.currentPath
      );

      useComposerStore.getState().clear();

      const { get: getRequestState, set: setRequestState } =
        getChatRequestHandlers();

      await startChatRequest(getRequestState, setRequestState, {
        messages: pathMessages,
        navigate,
        titleSource: { role: "user", blocks: result.addedMessage.blocks },
      });
    },
    stop: () => {
      const { chatClient } = get();
      const treeState = useMessageTreeStore.getState();
      const { conversationId, messages, currentPath } = treeState;
      if (conversationId) {
        void persistConversation(conversationId, messages, currentPath);
      }
      if (!chatClient) {
        set({ pending: false, chatClient: null, activeRequestId: null });
        return;
      }
      chatClient.abort();
      set({ pending: false, chatClient: null, activeRequestId: null });
    },
    setCurrentRole: (role) => {
      set({ currentRole: role });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ROLE_STORAGE_KEY, role);
      }
    },
    clear: () => {
      const client = get().chatClient;
      if (client) {
        client.abort();
      }
      set({
        pending: false,
        chatClient: null,
        activeRequestId: null,
      });
    },
    _setPending: (pending) => set({ pending }),
    _setChatClient: (chatClient) => set({ chatClient }),
    _setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
  })
);

const buildStoreStateSnapshot = () => {
  const treeState = useMessageTreeStore.getState();
  const requestState = useChatRequestStore.getState();
  return {
    messages: treeState.messages,
    currentPath: treeState.currentPath,
    conversationId: treeState.conversationId,
    pending: requestState.pending,
    chatClient: requestState.chatClient,
    activeRequestId: requestState.activeRequestId,
  };
};

const applyRequestPartial = (
  partial: Partial<ReturnType<typeof buildStoreStateSnapshot>>
) => {
  const treeStore = useMessageTreeStore.getState();
  const nextRequestState: Partial<ChatRequestState> = {};

  if (Object.prototype.hasOwnProperty.call(partial, "pending")) {
    nextRequestState.pending = partial.pending ?? false;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "chatClient")) {
    nextRequestState.chatClient = partial.chatClient ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "activeRequestId")) {
    nextRequestState.activeRequestId = partial.activeRequestId ?? null;
  }

  if (Object.keys(nextRequestState).length > 0) {
    useChatRequestStore.setState(nextRequestState);
  }

  if (Object.prototype.hasOwnProperty.call(partial, "conversationId")) {
    treeStore.setConversationId(partial.conversationId ?? null);
  }
};

export const getChatRequestHandlers = () => {
  const getRequestState = () => {
    const treeState = useMessageTreeStore.getState();
    const requestState = useChatRequestStore.getState();
    return {
      messages: treeState.messages,
      currentPath: treeState.currentPath,
      conversationId: treeState.conversationId,
      currentRole: requestState.currentRole,
      pending: requestState.pending,
      activeRequestId: requestState.activeRequestId,
      appendToAssistant: treeState.appendToAssistant,
    };
  };

  const setRequestState = (
    partial:
      | Partial<ReturnType<typeof buildStoreStateSnapshot>>
      | ((state: ReturnType<typeof buildStoreStateSnapshot>) => Partial<
          ReturnType<typeof buildStoreStateSnapshot>
        >)
  ) => {
    if (typeof partial === "function") {
      const snapshot = buildStoreStateSnapshot();
      const resolved = partial(snapshot);
      applyRequestPartial(resolved);
      return;
    }
    applyRequestPartial(partial);
  };

  return { get: getRequestState, set: setRequestState };
};
