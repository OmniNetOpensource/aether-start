import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const {
  navigateMock,
  getConversationFnMock,
  resetLastEventIdMock,
  resumeRunningConversationMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getConversationFnMock: vi.fn(),
  resetLastEventIdMock: vi.fn(),
  resumeRunningConversationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/server/functions/conversations", () => ({
  getConversationFn: getConversationFnMock,
}));

vi.mock("@/lib/chat/api/chat-orchestrator", () => ({
  startChatRequest: vi.fn(),
  resetLastEventId: resetLastEventIdMock,
  resumeRunningConversation: resumeRunningConversationMock,
  stopActiveChatRequest: vi.fn(),
}));

import { useConversationLoader } from "./useConversationLoader";
import { useComposerStore } from "@/stores/zustand/useComposerStore";
import {
  initialChatRequestState,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";
import { useEditingStore } from "@/stores/zustand/useEditingStore";
import {
  initialConversationListState,
  initialChatSessionSelectionState,
  useChatSessionStore,
} from "@/stores/zustand/useChatSessionStore";

function TestComponent(props: { conversationId?: string }) {
  useConversationLoader(props.conversationId);
  return null;
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("useConversationLoader", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    getConversationFnMock.mockReset();
    resetLastEventIdMock.mockReset();
    resumeRunningConversationMock.mockReset();
    resumeRunningConversationMock.mockResolvedValue(undefined);

    useComposerStore.getState().clear();
    useEditingStore.getState().clear();
    useChatSessionStore.getState().clearSession();
    useChatSessionStore.setState({
      ...initialConversationListState,
      ...initialChatSessionSelectionState,
    });
    useChatRequestStore.setState(initialChatRequestState);
    const store = useChatRequestStore.getState();
    store.setRequestPhase("done");
    store.setConnectionState("idle");
    const messageTreeStore = useChatSessionStore.getState();
    messageTreeStore.setCurrentRole("aether");
    messageTreeStore.setAvailableRoles([{ id: "aether", name: "Aether" }]);
    messageTreeStore.setRolesLoading(false);
  });

  it("loads the conversation and probes for a running request after hydration", async () => {
    getConversationFnMock.mockResolvedValueOnce({
      id: "conv-1",
      role: "aether",
      currentPath: [],
      messages: [],
      created_at: "2026-03-06T00:00:00.000Z",
      updated_at: "2026-03-06T00:00:00.000Z",
    });

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestComponent conversationId="conv-1" />);
      await flush();
    });

    expect(useChatSessionStore.getState().conversationId).toBe("conv-1");
    expect(resetLastEventIdMock).toHaveBeenCalledTimes(1);
    expect(resumeRunningConversationMock).toHaveBeenCalledTimes(1);
    expect(resumeRunningConversationMock).toHaveBeenCalledWith(
      "conv-1",
      expect.any(AbortSignal),
    );

    await act(async () => {
      root.unmount();
      await flush();
    });
  });
});
