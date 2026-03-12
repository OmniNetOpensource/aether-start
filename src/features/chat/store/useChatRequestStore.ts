import { create } from "zustand";

export type ChatConnectionState = "connecting" | "connected" | "disconnected";

export type ChatRequestPhase = "sending" | "answering" | "done";

export type ChatRequestState = {
  requestPhase: ChatRequestPhase;
  activeRequestId: string | null;
  connectionState: "idle" | ChatConnectionState;
};

type ChatRequestActions = {
  setRequestPhase: (phase: ChatRequestPhase) => void;
  setActiveRequestId: (requestId: string | null) => void;
  setConnectionState: (connectionState: "idle" | ChatConnectionState) => void;
  clearRequestState: () => void;
};

export type ChatRequestStore = ChatRequestState & ChatRequestActions;

export const initialChatRequestState: ChatRequestState = {
  requestPhase: "done",
  activeRequestId: null,
  connectionState: "idle",
};

export const useChatRequestStore = create<ChatRequestStore>()((set, get) => ({
  ...initialChatRequestState,
  setRequestPhase: (phase) => set({ requestPhase: phase }),
  setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
  setConnectionState: (connectionState) => set({ connectionState }),
  clearRequestState: () =>
    set({
      requestPhase: "done",
      activeRequestId: null,
      connectionState: get().connectionState,
    }),
}));
