import { create } from "zustand";
import {
  getAvailableModelsFn,
  getAvailablePromptsFn,
} from "@/server/functions/chat/models";

export type ChatConnectionState = "connecting" | "connected" | "disconnected";

export type RoleInfo = { id: string; name: string };

export type PromptInfo = { id: string; name: string };

export type ChatRequestPhase = "sending" | "answering" | "done";

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
  requestPhase: ChatRequestPhase;
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
  setRequestPhase: (phase: ChatRequestPhase) => void;
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
  requestPhase: "done",
  activeRequestId: null,
  connectionState: "idle",
  currentRole: "",
  availableRoles: [],
  rolesLoading: false,
  currentPrompt: "",
  availablePrompts: [],
  promptsLoading: false,
};

export const useChatRequestStore = create<ChatRequestStore>()((set, get) => ({
  ...initialChatRequestState,
  setRequestPhase: (phase) => set({ requestPhase: phase }),
  setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setCurrentRole: (currentRole) => {
    set({ currentRole });

    if (currentRole) {
      setStoredModel(currentRole);
    }
  },
  setAvailableRoles: (availableRoles) => set({ availableRoles }),
  setRolesLoading: (rolesLoading) => set({ rolesLoading }),
  loadAvailableRoles: async () => {
    const state = get();
    if (state.availableRoles.length > 0 || state.rolesLoading) {
      return;
    }

    set({ rolesLoading: true });

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

      set({ availableRoles: roles });
    } catch {
      // ignore
    } finally {
      set({ rolesLoading: false });
    }
  },
  setCurrentPrompt: (currentPrompt) => {
    set({ currentPrompt });

    if (currentPrompt) {
      setStoredPrompt(currentPrompt);
    }
  },
  setAvailablePrompts: (availablePrompts) => set({ availablePrompts }),
  setPromptsLoading: (promptsLoading) => set({ promptsLoading }),
  loadAvailablePrompts: async () => {
    const state = get();
    if (state.availablePrompts.length > 0 || state.promptsLoading) {
      return;
    }

    set({ promptsLoading: true });

    try {
      const prompts = await getAvailablePromptsFn();
      const firstId = prompts[0]?.id ?? "aether";
      const stored = getStoredPrompt();
      const storedValid = stored && prompts.some((p) => p.id === stored);
      const promptToUse = storedValid ? stored : firstId;

      if (promptToUse) {
        get().setCurrentPrompt(promptToUse);
      }

      set({ availablePrompts: prompts });
    } catch {
      // ignore
    } finally {
      set({ promptsLoading: false });
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
    set((state) => ({
      requestPhase: "done",
      activeRequestId: null,
      connectionState: state.connectionState,
      currentRole: state.currentRole,
      availableRoles: state.availableRoles,
      rolesLoading: state.rolesLoading,
      currentPrompt: state.currentPrompt,
      availablePrompts: state.availablePrompts,
      promptsLoading: state.promptsLoading,
    })),
}));
