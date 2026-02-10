import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "@/shared/hooks/useToast";
import type { ChatClient } from "@/features/chat/api/client/chat-request";
import { startChatRequest } from "@/features/chat/api/client/chat-request";
import { DEFAULT_ROLE_ID, ROLES } from "@/features/chat/session/config/roles";
import {
  computeMessagesFromPath,
} from "@/features/conversation/model/tree/message-tree";
import {
  buildUserBlocks,
} from "@/features/conversation/model/tree/block-operations";
import {
  buildConversationPayload,
  persistConversation as persistConversationService,
  resolveExistingConversation,
} from "@/features/conversation/persistence/persist-service";
import { useComposerStore } from "@/features/chat/composer/store/useComposerStore";
import { useMessageTreeStore } from "@/features/chat/messages/store/useMessageTreeStore";

type ChatRequestState = {
  pending: boolean;
  chatClient: ChatClient | null;
  activeRequestId: string | null;
  currentRole: string;
};

type ChatRequestActions = {
  sendMessage: () => Promise<void>;
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

export const useChatRequestStore = create<ChatRequestState & ChatRequestActions>()(
  devtools(
    (set, get) => ({
      pending: false,
      chatClient: null,
      activeRequestId: null,
      currentRole: getInitialRole(),
      sendMessage: async () => {
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

        await startChatRequest({
          messages: pathMessages,
          titleSource: { role: "user", blocks: result.addedMessage.blocks },
        });
      },
      stop: () => {
        const { chatClient } = get();
        const treeState = useMessageTreeStore.getState();
        const { conversationId, messages, currentPath } = treeState;
        if (conversationId) {
          void (async () => {
            const existing = await resolveExistingConversation(conversationId);
            const payload = buildConversationPayload({
              id: conversationId,
              messages,
              currentPath,
              existingConversation: existing,
            });
            persistConversationService(payload, { force: true });
          })();
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
    }),
    { name: "ChatRequestStore" }
  )
);
