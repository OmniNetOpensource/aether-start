import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { getAvailableRolesFn } from "@/server/functions/chat/roles";

export type ChatConnectionState = "connecting" | "connected" | "disconnected";

export type RoleInfo = { id: string; name: string };

export type ChatRequestStatus = "sending" | "answering" | "done";

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

export type ChatRequestState = {
  status: ChatRequestStatus;
  activeRequestId: string | null;
  connectionState: "idle" | ChatConnectionState;
  currentRole: string;
  availableRoles: RoleInfo[];
  rolesLoading: boolean;
};

type ChatRequestActions = {
  setStatus: (status: ChatRequestStatus) => void;
  setActiveRequestId: (requestId: string | null) => void;
  setConnectionState: (connectionState: "idle" | ChatConnectionState) => void;
  setCurrentRole: (role: string) => void;
  setAvailableRoles: (roles: RoleInfo[]) => void;
  setRolesLoading: (loading: boolean) => void;
  loadAvailableRoles: () => Promise<void>;
  clearRequestState: () => void;
};

export type ChatRequestStore = ChatRequestState & ChatRequestActions;

export const initialChatRequestState: ChatRequestState = {
  status: "done",
  activeRequestId: null,
  connectionState: "idle",
  currentRole: "",
  availableRoles: [],
  rolesLoading: false,
};

export const useChatRequestStore = create<ChatRequestStore>()(
  devtools(
    (set, get) => ({
      ...initialChatRequestState,
      setStatus: (status) => set({ status }, false, "setStatus"),
      setActiveRequestId: (activeRequestId) =>
        set({ activeRequestId }, false, "setActiveRequestId"),
      setConnectionState: (connectionState) =>
        set({ connectionState }, false, "setConnectionState"),
      setCurrentRole: (currentRole) => {
        set({ currentRole }, false, "setCurrentRole");

        if (currentRole) {
          setStoredRole(currentRole);
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
          const roles = await getAvailableRolesFn();
          const firstId = roles[0]?.id ?? "";
          const stored = getStoredRole();
          const storedValid =
            stored && roles.some((role) => role.id === stored);
          const roleToUse = storedValid ? stored : firstId;

          if (roleToUse) {
            get().setCurrentRole(roleToUse);
          }

          set({ availableRoles: roles }, false, "loadAvailableRoles/success");
        } catch {
          // ignore
        } finally {
          set({ rolesLoading: false }, false, "loadAvailableRoles/done");
        }
      },
      clearRequestState: () =>
        set(
          (state) => ({
            status: "done",
            activeRequestId: null,
            connectionState: state.connectionState,
            currentRole: state.currentRole,
            availableRoles: state.availableRoles,
            rolesLoading: state.rolesLoading,
          }),
          false,
          "clearRequestState",
        ),
    }),
    { name: "ChatRequestStore" },
  ),
);

export const isChatRequestActive = (status: ChatRequestStatus) =>
  status !== "done";

export const isChatRequestAnswering = (status: ChatRequestStatus) =>
  status === "answering";

export const selectChatRequestState = (state: ChatRequestStore) => ({
  status: state.status,
  activeRequestId: state.activeRequestId,
  connectionState: state.connectionState,
  currentRole: state.currentRole,
  availableRoles: state.availableRoles,
  rolesLoading: state.rolesLoading,
});

export const selectChatRequestStatus = (state: ChatRequestStore) =>
  state.status;
export const selectActiveRequestId = (state: ChatRequestStore) =>
  state.activeRequestId;
export const selectConnectionState = (state: ChatRequestStore) =>
  state.connectionState;
export const selectCurrentRole = (state: ChatRequestStore) => state.currentRole;
export const selectAvailableRoles = (state: ChatRequestStore) =>
  state.availableRoles;
export const selectRolesLoading = (state: ChatRequestStore) =>
  state.rolesLoading;
