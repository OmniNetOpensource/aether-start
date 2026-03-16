import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialChatRequestState,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";

const {
  addConversationMock,
  applyChatEventToTreeMock,
  messageTreeState,
  fetchMock,
} = vi.hoisted(() => {
  const messageTreeState = {
    conversationId: "conv-1" as string | null,
    currentRole: "aether",
    currentPrompt: "",
    availableRoles: [] as Array<{ id: string; name: string }>,
    setConversationId: vi.fn((conversationId: string) => {
      messageTreeState.conversationId = conversationId;
    }),
    setCurrentRole: vi.fn((currentRole: string) => {
      messageTreeState.currentRole = currentRole;
    }),
    getTreeState: vi.fn(() => ({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    })),
    getMessagesFromPath: vi.fn(() => [{ role: "user", blocks: [] }]),
  };

  return {
    addConversationMock: vi.fn(),
    applyChatEventToTreeMock: vi.fn(),
    messageTreeState,
    fetchMock: vi.fn(),
  };
});

vi.mock("@/hooks/useToast", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/stores/zustand/useChatSessionStore", () => ({
  useChatSessionStore: {
    getState: () => ({
      addConversation: addConversationMock,
      ...messageTreeState,
    }),
  },
}));

vi.mock("@/lib/chat/api/event-handlers", () => ({
  applyChatEventToTree: applyChatEventToTreeMock,
}));

vi.stubGlobal("fetch", fetchMock);

// Helper: create a ReadableStream that closes immediately
const emptyStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

const errorStream = (error: Error) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    },
  });

// Helper: create an SSE stream from events
const sseStream = (
  events: Array<{ event: string; data: unknown }>,
  options?: { lineEnding?: "\n" | "\r\n"; chunkSize?: number },
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const lineEnding = options?.lineEnding ?? "\n";
      const payload = events
        .map(
          ({ event, data }) =>
            `event: ${event}${lineEnding}data: ${JSON.stringify(data)}${lineEnding}${lineEnding}`,
        )
        .join("");

      if (options?.chunkSize) {
        for (
          let index = 0;
          index < payload.length;
          index += options.chunkSize
        ) {
          controller.enqueue(
            encoder.encode(payload.slice(index, index + options.chunkSize)),
          );
        }
      } else {
        controller.enqueue(encoder.encode(payload));
      }

      controller.close();
    },
  });

describe("chat-orchestrator SSE model", () => {
  beforeEach(async () => {
    addConversationMock.mockReset();
    applyChatEventToTreeMock.mockReset();
    fetchMock.mockReset();

    useChatRequestStore.setState(initialChatRequestState);

    messageTreeState.conversationId = "conv-1";
    messageTreeState.currentRole = "aether";
    messageTreeState.currentPrompt = "";
    messageTreeState.availableRoles = [{ id: "aether", name: "Aether" }];
    messageTreeState.setConversationId.mockClear();
    messageTreeState.setCurrentRole.mockClear();
    messageTreeState.getTreeState.mockClear();
    messageTreeState.getMessagesFromPath.mockClear();

    const orchestrator = await import("./chat-orchestrator");
    orchestrator.resetLastEventId();
  });

  it("sends a POST to /chat and consumes the SSE response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        { event: "chat_started", data: {} },
        {
          event: "chat_event",
          data: {
            eventId: 1,
            event: { type: "content", content: "hello" },
          },
        },
        {
          event: "chat_finished",
          data: { status: "completed" },
        },
      ]),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/conv-1/chat");
    expect(opts.method).toBe("POST");

    // After SSE consumption finishes, request should be done
    expect(useChatRequestStore.getState().status).toBe("idle");
    expect(applyChatEventToTreeMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "content", content: "hello" }),
    );
  });

  it("proceeds when conversationId is null (caller must ensure)", async () => {
    messageTreeState.conversationId = null;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        { event: "chat_finished", data: { status: "completed" } },
      ]),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    expect(fetchMock).toHaveBeenCalled();
  });

  it("parses CRLF SSE streams across chunk boundaries", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream(
        [
          { event: "chat_started", data: {} },
          {
            event: "chat_event",
            data: {
              eventId: 99,
              event: { type: "content", content: "hello crlf" },
            },
          },
          {
            event: "chat_finished",
            data: { status: "completed" },
          },
        ],
        { lineEnding: "\r\n", chunkSize: 64 },
      ),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    expect(applyChatEventToTreeMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "content", content: "hello crlf" }),
    );
    expect(useChatRequestStore.getState().status).toBe("idle");
  });

  it("does not drop new /chat events when a previous request used a higher event id", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        {
          event: "chat_event",
          data: {
            eventId: 99,
            event: { type: "content", content: "older stream" },
          },
        },
        {
          event: "chat_finished",
          data: { status: "completed" },
        },
      ]),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        {
          event: "chat_event",
          data: {
            eventId: 1,
            event: { type: "content", content: "fresh stream" },
          },
        },
        {
          event: "chat_finished",
          data: { status: "completed" },
        },
      ]),
    });

    await orchestrator.startChatRequest();

    expect(applyChatEventToTreeMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "content", content: "fresh stream" }),
    );
  });

  it("handles 409 busy response from server", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ type: "busy" }),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    expect(useChatRequestStore.getState().status).toBe("streaming");
  });

  it("sets status to idle and toasts when the stream breaks mid-response", async () => {
    const { toast } = await import("@/hooks/useToast");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: errorStream(new TypeError("network down")),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    expect(useChatRequestStore.getState().status).toBe("idle");
    expect(toast.error).toHaveBeenCalledWith("连接中断");
  });

  it("cancelStreamSubscription aborts controller and sets status to idle", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: emptyStream(),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();

    orchestrator.cancelStreamSubscription();

    expect(useChatRequestStore.getState().status).toBe("idle");
  });

  it("cancelAnswering aborts locally and POSTs /abort when conversationId exists", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: emptyStream(),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.startChatRequest();
    orchestrator.cancelAnswering();

    expect(useChatRequestStore.getState().status).toBe("idle");
    const abortCall = fetchMock.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && (call[0] as string).includes("/abort"),
    );
    expect(abortCall).toBeDefined();
  });

  it("resumeRunningConversation connects to events stream when agent is running", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "running" }),
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: sseStream([
        {
          event: "sync_response",
          data: { status: "running", events: [] },
        },
        {
          event: "chat_finished",
          data: { status: "completed" },
        },
      ]),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.resumeRunningConversation("conv-1");

    expect(useChatRequestStore.getState().status).toBe("idle");

    // Should have made the status probe and events subscription
    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    expect(
      calls.some(
        ([url]) => url.includes("/conv-1") && !url.includes("/events"),
      ),
    ).toBe(true);
    expect(calls.some(([url]) => url.includes("/conv-1/events"))).toBe(true);
  });

  it("resumeRunningConversation returns early when agent is idle", async () => {
    useChatRequestStore.getState().setStatus("streaming");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "idle" }),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.resumeRunningConversation("conv-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resumeRunningConversation returns early when recovery finds no running agent", async () => {
    useChatRequestStore.getState().setStatus("streaming");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "idle" }),
    });

    const orchestrator = await import("./chat-orchestrator");
    await orchestrator.resumeRunningConversation("conv-1");
  });
});
