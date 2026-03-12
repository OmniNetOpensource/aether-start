import { create } from "zustand";

export type ChatConnectionState = "connecting" | "connected" | "disconnected";

export type ChatRequestPhase = "sending" | "answering" | "done";

export type ChatRequestState = {
  requestPhase: ChatRequestPhase;
  connectionState: "idle" | ChatConnectionState;
};

type ChatRequestActions = {
  setRequestPhase: (phase: ChatRequestPhase) => void;
  setConnectionState: (connectionState: "idle" | ChatConnectionState) => void;
  clearRequestState: () => void;
};

export type ChatRequestStore = ChatRequestState & ChatRequestActions;

export const initialChatRequestState: ChatRequestState = {
  requestPhase: "done",
  connectionState: "idle",
};

export const useChatRequestStore = create<ChatRequestStore>()((set, get) => ({
  ...initialChatRequestState,
  setRequestPhase: (phase) => set({ requestPhase: phase }),
  setConnectionState: (connectionState) => set({ connectionState }),
  clearRequestState: () =>
    set({
      requestPhase: "done",
      connectionState: get().connectionState,
    }),
}));
