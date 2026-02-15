import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "@/shared/hooks/useToast";
import type { ChatClient } from "@/features/chat/api/client/websocket-client";
import {
  resumeRunningConversation,
  startChatRequest,
} from "@/features/chat/api/client/chat-orchestrator";
import { DEFAULT_ROLE_ID } from "@/features/chat/session/config/roles";
import {
  computeMessagesFromPath,
} from "@/features/conversation/model/tree/message-tree";
import {
  buildUserBlocks,
} from "@/features/conversation/model/tree/block-operations";
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
  resumeIfRunning: (conversationId: string) => Promise<void>;
  setCurrentRole: (role: string) => void;
  clear: () => void;
  _setPending: (pending: boolean) => void;
  _setChatClient: (client: ChatClient | null) => void;
  _setActiveRequestId: (id: string | null) => void;
};

const getInitialRole = (): string => {
  return DEFAULT_ROLE_ID;
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
        if (!chatClient) {
          set({ pending: false, chatClient: null, activeRequestId: null });
          return;
        }
        chatClient.abort(get().activeRequestId ?? undefined);
        chatClient.disconnect();
        set({ pending: false, chatClient: null, activeRequestId: null });
      },
      resumeIfRunning: async (conversationId) => {
        if (!conversationId) {
          return;
        }

        await resumeRunningConversation(conversationId);
      },
      setCurrentRole: (role) => {
        set({ currentRole: role });
      },
      clear: () => {
        const client = get().chatClient;
        if (client) {
          client.abort(get().activeRequestId ?? undefined);
          client.disconnect();
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
