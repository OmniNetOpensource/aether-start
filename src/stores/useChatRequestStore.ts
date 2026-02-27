import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "@/hooks/useToast";
import type { ChatClient } from "@/lib/chat/api/websocket-client";
import {
  resumeRunningConversation,
  startChatRequest,
} from "@/lib/chat/api/chat-orchestrator";
import {
  computeMessagesFromPath,
} from "@/lib/conversation/tree/message-tree";
import {
  buildUserBlocks,
} from "@/lib/conversation/tree/block-operations";
import { useComposerStore } from "@/stores/useComposerStore";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { getAvailableRolesFn } from "@/server/functions/chat/roles";

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

const getInitialRole = (): string => "";

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
          const { currentRole } = get();
          const firstId = roles[0]?.id ?? "";
          const shouldSetDefault =
            !currentRole || !roles.some((r) => r.id === currentRole);
          set({
            availableRoles: roles,
            rolesLoading: false,
            ...(shouldSetDefault && firstId ? { currentRole: firstId } : {}),
          });
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
