import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "@/hooks/useToast";
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
import { useComposerStore } from "@/stores/useComposerStore";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { getAvailableRolesFn } from "@/features/chat/api/server/functions/roles";

type RoleInfo = { id: string; name: string };

type ChatRequestState = {
  pending: boolean;
  chatClient: ChatClient | null;
  activeRequestId: string | null;
  currentRole: string;
  availableRoles: RoleInfo[];
  rolesLoading: boolean;
};

type ChatRequestActions = {
  sendMessage: () => Promise<void>;
  stop: () => void;
  resumeIfRunning: (conversationId: string) => Promise<void>;
  setCurrentRole: (role: string) => void;
  loadRoles: () => Promise<void>;
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
      availableRoles: [],
      rolesLoading: false,
      sendMessage: async () => {
        const { input, pendingAttachments } =
          useComposerStore.getState();
        const trimmed = input.trim();
        const selectedRole = get().currentRole;

        if (get().pending) {
          return;
        }
        if (!trimmed && pendingAttachments.length === 0) {
          return;
        }
        if (!selectedRole) {
          toast.warning("请先选择角色");
          return;
        }

        const finalInput = input;

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
      loadRoles: async () => {
        const { availableRoles, rolesLoading } = get();
        if (availableRoles.length > 0 || rolesLoading) {
          return;
        }

        set({ rolesLoading: true });
        try {
          const roles = await getAvailableRolesFn();
          set({ availableRoles: roles, rolesLoading: false });
        } catch {
          set({ rolesLoading: false });
        }
      },
      clear: () => {
        const client = get().chatClient;
        if (client) {
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
