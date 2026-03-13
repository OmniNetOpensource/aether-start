import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => {
  const fetchMock = vi.fn();
  return { fetchMock };
});

// Mock global fetch
vi.stubGlobal("fetch", fetchMock);

// Mock stores
vi.mock("@/stores/zustand/useChatRequestStore", () => {
  const store = {
    getState: () => store._state,
    _state: {
      status: "idle" as string,
      setStatus: vi.fn(),
    },
  };
  return {
    useChatRequestStore: store,
  };
});

vi.mock("@/stores/zustand/useChatSessionStore", () => ({
  useChatSessionStore: {
    getState: () => ({
      conversationId: "conv-a",
      addConversation: vi.fn(),
      getTreeState: () => ({
        messages: [],
        currentPath: [],
        latestRootId: null,
        nextId: 1,
      }),
    }),
  },
}));

vi.mock("@/lib/chat/api/event-handlers", () => ({
  applyChatEventToTree: vi.fn(),
}));

vi.mock("@/lib/navigation", () => ({
  appNavigate: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: { warning: vi.fn() },
}));

import { resetLastEventId, checkAgentStatus } from "./chat-orchestrator";

describe("SSE orchestrator", () => {
  beforeEach(() => {
    resetLastEventId();
    fetchMock.mockReset();
  });

  describe("checkAgentStatus", () => {
    it("returns idle status on 404", async () => {
      fetchMock.mockResolvedValueOnce({
        status: 404,
        ok: false,
      });

      const result = await checkAgentStatus("conv-a");
      expect(result).toEqual({ status: "idle" });
    });

    it("returns running status", async () => {
      fetchMock.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ status: "running" }),
      });

      const result = await checkAgentStatus("conv-a");
      expect(result).toEqual({ status: "running" });
    });

    it("throws on non-ok non-404 response", async () => {
      fetchMock.mockResolvedValueOnce({
        status: 500,
        ok: false,
      });

      await expect(checkAgentStatus("conv-a")).rejects.toThrow(
        "Agent status probe failed: 500",
      );
    });
  });

  describe("resetLastEventId", () => {
    it("can be called without error", () => {
      expect(() => resetLastEventId()).not.toThrow();
    });
  });
});
