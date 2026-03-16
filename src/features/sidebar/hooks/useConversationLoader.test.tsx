import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const {
  resetLastEventIdMock,
  resumeRunningConversationMock,
} = vi.hoisted(() => ({
  resetLastEventIdMock: vi.fn(),
  resumeRunningConversationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/chat/api/chat-orchestrator", () => ({
  startChatRequest: vi.fn(),
  resetLastEventId: resetLastEventIdMock,
  resumeRunningConversation: resumeRunningConversationMock,
  stopActiveChatRequest: vi.fn(),
}));

import {
  useConversationLoader,
  type ConversationLoaderPayload,
} from "./useConversationLoader";
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

const mockConversation: ConversationLoaderPayload = {
  id: "conv-1",
  user_id: "u1",
  title: null,
  role: "aether",
  is_pinned: false,
  pinned_at: null,
  currentPath: [],
  messages: [],
  artifacts: [],
  created_at: "2026-03-06T00:00:00.000Z",
  updated_at: "2026-03-06T00:00:00.000Z",
};

function TestComponent(props: {
  conversationId?: string;
  loaderData?: { newChat: true } | { conversation: typeof mockConversation };
}) {
  useConversationLoader(props.conversationId, props.loaderData);
  return null;
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("useConversationLoader", () => {
  beforeEach(() => {
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
    const messageTreeStore = useChatSessionStore.getState();
    messageTreeStore.setCurrentRole("aether");
    messageTreeStore.setAvailableRoles([{ id: "aether", name: "Aether" }]);
    messageTreeStore.setRolesLoading(false);
  });

  it("loads the conversation and probes for a running request after hydration", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestComponent
          conversationId="conv-1"
          loaderData={{ conversation: mockConversation }}
        />,
      );
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

  it("does not open a recovery stream while the current request is already active", async () => {
    useChatRequestStore.getState().setStatus("streaming");

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TestComponent
          conversationId="conv-1"
          loaderData={{ conversation: mockConversation }}
        />,
      );
      await flush();
    });

    expect(resetLastEventIdMock).not.toHaveBeenCalled();
    expect(resumeRunningConversationMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await flush();
    });
  });
});
