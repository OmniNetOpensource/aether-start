import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getAvailableModelsFn,
  getAvailablePromptsFn,
} from "@/server/functions/chat/models";

export type ChatConnectionState = "connecting" | "connected" | "disconnected";

export type RoleInfo = { id: string; name: string };

export type PromptInfo = { id: string; name: string };

export type ChatRequestStatus = "sending" | "answering" | "done";

const MODEL_STORAGE_KEY = "aether_current_role";
const PROMPT_STORAGE_KEY = "aether_current_prompt";

function getStoredModel(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredModel(model: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(MODEL_STORAGE_KEY, model);
  } catch {
    // ignore
  }
}

function getStoredPrompt(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(PROMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredPrompt(prompt: string): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(PROMPT_STORAGE_KEY, prompt);
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
  currentPrompt: string;
  availablePrompts: PromptInfo[];
  promptsLoading: boolean;
};

type ChatRequestActions = {
  setStatus: (status: ChatRequestStatus) => void;
  setActiveRequestId: (requestId: string | null) => void;
  setConnectionState: (connectionState: "idle" | ChatConnectionState) => void;
  setCurrentRole: (role: string) => void;
  setAvailableRoles: (roles: RoleInfo[]) => void;
  setRolesLoading: (loading: boolean) => void;
  loadAvailableRoles: () => Promise<void>;
  setCurrentPrompt: (promptId: string) => void;
  setAvailablePrompts: (prompts: PromptInfo[]) => void;
  setPromptsLoading: (loading: boolean) => void;
  loadAvailablePrompts: () => Promise<void>;
  cyclePrompt: () => void;
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
  currentPrompt: "",
  availablePrompts: [],
  promptsLoading: false,
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
          setStoredModel(currentRole);
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
          const stored = getStoredModel();
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
      setCurrentPrompt: (currentPrompt) => {
        set({ currentPrompt }, false, "setCurrentPrompt");

        if (currentPrompt) {
          setStoredPrompt(currentPrompt);
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
          const stored = getStoredPrompt();
          const storedValid =
            stored && prompts.some((p) => p.id === stored);
          const promptToUse = storedValid ? stored : firstId;

          if (promptToUse) {
            get().setCurrentPrompt(promptToUse);
          }

          set({ availablePrompts: prompts }, false, "loadAvailablePrompts/success");
        } catch {
          // ignore
        } finally {
          set({ promptsLoading: false }, false, "loadAvailablePrompts/done");
        }
      },
      cyclePrompt: () => {
        const state = get();
        const prompts = state.availablePrompts;
        if (prompts.length === 0) return;

        const idx = prompts.findIndex((p) => p.id === state.currentPrompt);
        const nextIdx = idx < 0 ? 0 : (idx + 1) % prompts.length;
        get().setCurrentPrompt(prompts[nextIdx].id);
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
            currentPrompt: state.currentPrompt,
            availablePrompts: state.availablePrompts,
            promptsLoading: state.promptsLoading,
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
  currentPrompt: state.currentPrompt,
  availablePrompts: state.availablePrompts,
  promptsLoading: state.promptsLoading,
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
export const selectCurrentPrompt = (state: ChatRequestStore) =>
  state.currentPrompt;
export const selectAvailablePrompts = (state: ChatRequestStore) =>
  state.availablePrompts;
export const selectPromptsLoading = (state: ChatRequestStore) =>
  state.promptsLoading;
