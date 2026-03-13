import { create } from "zustand";

export type ChatStatus = "idle" | "sending" | "streaming" | "disconnected";

export const initialChatRequestState = { status: "idle" as ChatStatus };

export const useChatRequestStore = create<{
  status: ChatStatus;
  setStatus: (status: ChatStatus) => void;
}>()((set) => ({
  ...initialChatRequestState,
  setStatus: (status) => set({ status }),
}));
