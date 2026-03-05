import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "@/hooks/useToast";
import type {
  ChatClient,
  ChatConnectionState,
} from "@/lib/chat/api/websocket-client";
import {
  resumeRunningConversation,
  startChatRequest,
} from "@/lib/chat/api/chat-orchestrator";
import { computeMessagesFromPath } from "@/lib/conversation/tree/message-tree";
import { buildUserBlocks } from "@/lib/conversation/tree/block-operations";
import { useComposerStore } from "@/stores/useComposerStore";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { getAvailableRolesFn } from "@/server/functions/chat/roles";

type RoleInfo = { id: string; name: string };

const ROLE_STORAGE_KEY = "aether_current_role";

function getStoredRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ROLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredRole(role: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROLE_STORAGE_KEY, role);
  } catch {
    // ignore
  }
}

type ChatRequestState = {
  pending: boolean;
  chatClient: ChatClient | null;
  activeRequestId: string | null;
  connectionState: "idle" | ChatConnectionState;
  connectionStateUpdatedAt: number;
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
  disposeConnection: () => void;
  _setPending: (pending: boolean) => void;
  _setChatClient: (client: ChatClient | null) => void;
  _setActiveRequestId: (id: string | null) => void;
  _setConnectionState: (state: "idle" | ChatConnectionState) => void;
};

const getInitialRole = (): string => "";

export const useChatRequestStore = create<
  ChatRequestState & ChatRequestActions
>()(
  devtools(
    (set, get) => ({
      pending: false,
      chatClient: null,
      activeRequestId: null,
      connectionState: "idle",
      connectionStateUpdatedAt: 0,
      currentRole: getInitialRole(),
      availableRoles: [],
      rolesLoading: false,
      sendMessage: async () => {
        const { input, pendingAttachments } = useComposerStore.getState();
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
          buildUserBlocks(finalInput, pendingAttachments),
        );

        const pathMessages = computeMessagesFromPath(
          result.messages,
          result.currentPath,
        );

        useComposerStore.getState().clear();

        await startChatRequest({
          messages: pathMessages,
          titleSource: { role: "user", blocks: result.addedMessage.blocks },
        });
      },
      stop: () => {
        const { chatClient } = get();
        const connectionStateUpdatedAt = Date.now();
        if (!chatClient) {
          set({
            pending: false,
            chatClient: null,
            activeRequestId: null,
            connectionState: "idle",
            connectionStateUpdatedAt,
          });
          return;
        }
        // Abort current request but keep connection alive
        chatClient.abort(get().activeRequestId ?? undefined);
        set({
          pending: false,
          activeRequestId: null,
          connectionStateUpdatedAt,
        });
      },
      resumeIfRunning: async (conversationId) => {
        if (!conversationId) {
          return;
        }

        await resumeRunningConversation(conversationId);
      },
      setCurrentRole: (role) => {
        set({ currentRole: role });
        if (role) setStoredRole(role);
      },
      loadRoles: async () => {
        const { availableRoles, rolesLoading } = get();
        if (availableRoles.length > 0 || rolesLoading) {
          return;
        }

        set({ rolesLoading: true });
        try {
          const roles = await getAvailableRolesFn();
          const firstId = roles[0]?.id ?? "";
          const stored = getStoredRole();
          const storedValid = stored && roles.some((r) => r.id === stored);
          const roleToUse = storedValid ? stored : firstId;
          if (roleToUse) {
            set({ currentRole: roleToUse });
            setStoredRole(roleToUse);
          }
          set({
            availableRoles: roles,
            rolesLoading: false,
          });
        } catch {
          set({ rolesLoading: false });
        }
      },
      clear: () => {
        // Clear request state only, don't disconnect connection
        const connectionStateUpdatedAt = Date.now();
        set({
          pending: false,
          activeRequestId: null,
          connectionStateUpdatedAt,
        });
      },
      disposeConnection: () => {
        // Explicitly disconnect and dispose connection when leaving page
        const client = get().chatClient;
        const connectionStateUpdatedAt = Date.now();
        if (client) {
          client.disconnect();
        }
        set({
          pending: false,
          chatClient: null,
          activeRequestId: null,
          connectionState: "idle",
          connectionStateUpdatedAt,
        });
      },
      _setPending: (pending) => set({ pending }),
      _setChatClient: (chatClient) => set({ chatClient }),
      _setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
      _setConnectionState: (connectionState) =>
        set({ connectionState, connectionStateUpdatedAt: Date.now() }),
    }),
    { name: "ChatRequestStore" },
  ),
);
