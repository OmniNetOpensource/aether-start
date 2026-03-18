import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@/types/message";
import {
  initialChatRequestState,
  useChatRequestStore,
} from "@/stores/zustand/useChatRequestStore";
import {
  addMessage,
  createEmptyMessageState,
} from "@/lib/conversation/tree/message-tree";
import {
  initialChatSessionSelectionState,
  useChatSessionStore,
} from "@/stores/zustand/useChatSessionStore";

const { startChatRequestMock, cancelAnsweringMock, warningMock } = vi.hoisted(
  () => ({
    startChatRequestMock: vi.fn(),
    cancelAnsweringMock: vi.fn(),
    warningMock: vi.fn(),
  }),
);

vi.mock("@/lib/chat/api/chat-orchestrator", () => ({
  startChatRequest: startChatRequestMock,
  resumeRunningConversation: vi.fn(),
  cancelAnswering: cancelAnsweringMock,
}));

vi.mock("@/hooks/useToast", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: warningMock,
    error: vi.fn(),
  },
}));

import { useEditingStore } from "./useEditingStore";

const attachment = (id: string): Attachment => ({
  id,
  kind: "image",
  name: `${id}.png`,
  size: 100,
  mimeType: "image/png",
  url: `https://example.com/${id}.png`,
});

const seedTreeWithUserAndAssistant = () => {
  const userState = addMessage(
    createEmptyMessageState(),
    "user",
    [{ type: "content", content: "original content" }],
    "2024-01-01",
  );
  const fullState = addMessage(
    userState,
    "assistant",
    [{ type: "content", content: "assistant reply" }],
    "2024-01-02",
  );
  useChatSessionStore.getState().setTreeState(fullState);
};

describe("useEditingStore", () => {
  beforeEach(() => {
    startChatRequestMock.mockReset();
    startChatRequestMock.mockResolvedValue(undefined);
    cancelAnsweringMock.mockReset();
    warningMock.mockReset();

    useEditingStore.setState({ editingState: null });
    useChatSessionStore.setState({
      ...createEmptyMessageState(),
      conversationId: null,
      ...initialChatSessionSelectionState,
    });
    useChatRequestStore.setState(initialChatRequestState);
    useChatSessionStore.getState().setCurrentRole("aether");
    useChatSessionStore.getState().setAvailableRoles([]);
    useChatSessionStore.getState().setRolesLoading(false);
  });

  it("starts and cancels editing for a user message", () => {
    seedTreeWithUserAndAssistant();

    useEditingStore.getState().startEditing(1);
    expect(useEditingStore.getState().editingState).toMatchObject({
      messageId: 1,
      editedContent: "original content",
      editedQuotes: [],
      editedAttachments: [],
    });

    useEditingStore.getState().cancelEditing();
    expect(useEditingStore.getState().editingState).toBeNull();
  });

  it("does not start editing for non-user messages", () => {
    seedTreeWithUserAndAssistant();

    useEditingStore.getState().startEditing(2);
    expect(useEditingStore.getState().editingState).toBeNull();
  });

  it("updates edited content and attachments", () => {
    seedTreeWithUserAndAssistant();
    useEditingStore.getState().startEditing(1);

    useEditingStore.getState().updateEditContent("changed content");
    useEditingStore.getState().updateEditAttachments([attachment("att-1")]);

    expect(useEditingStore.getState().editingState).toMatchObject({
      editedContent: "changed content",
      editedQuotes: [],
      editedAttachments: [attachment("att-1")],
    });
  });

  it("extracts editedQuotes from user message with quotes block", () => {
    const userState = addMessage(
      createEmptyMessageState(),
      "user",
      [
        { type: "quotes", quotes: [{ id: "q1", text: "quoted text" }] },
        { type: "content", content: "my question" },
      ],
      "2024-01-01",
    );
    useChatSessionStore.getState().setTreeState(userState);

    useEditingStore.getState().startEditing(1);

    expect(useEditingStore.getState().editingState).toMatchObject({
      messageId: 1,
      editedContent: "my question",
      editedQuotes: [{ id: "q1", text: "quoted text" }],
      editedAttachments: [],
    });
  });

  it("submitEdit rebuilds blocks with quotes preserved", async () => {
    const userState = addMessage(
      createEmptyMessageState(),
      "user",
      [
        { type: "quotes", quotes: [{ id: "q1", text: "quoted" }] },
        { type: "content", content: "original" },
      ],
      "2024-01-01",
    );
    useChatSessionStore.getState().setTreeState(userState);

    useEditingStore.getState().startEditing(1);
    useEditingStore.getState().updateEditContent("edited");
    await useEditingStore.getState().submitEdit(1);

    const messages = useChatSessionStore.getState().getMessagesFromPath();
    const userMsg = messages[0];
    expect(userMsg.role).toBe("user");
    const quoteBlock = userMsg.blocks.find((b) => b.type === "quotes");
    expect(quoteBlock).toBeDefined();
    if (quoteBlock && quoteBlock.type === "quotes") {
      expect(quoteBlock.quotes).toEqual([{ id: "q1", text: "quoted" }]);
    }
    const contentBlock = userMsg.blocks.find((b) => b.type === "content");
    expect(
      contentBlock && contentBlock.type === "content"
        ? contentBlock.content
        : "",
    ).toBe("edited");
  });

  it("submitEdit warns when role is missing", async () => {
    seedTreeWithUserAndAssistant();
    useEditingStore.getState().startEditing(1);
    useChatSessionStore.getState().setCurrentRole("");

    await useEditingStore.getState().submitEdit(1);

    expect(warningMock).toHaveBeenCalledWith("请先选择角色");
    expect(startChatRequestMock).not.toHaveBeenCalled();
    expect(useEditingStore.getState().editingState).not.toBeNull();
  });

  it("submitEdit updates tree and starts chat request", async () => {
    seedTreeWithUserAndAssistant();
    useEditingStore.getState().startEditing(1);
    useEditingStore.getState().updateEditContent("edited user message");

    await useEditingStore.getState().submitEdit(1);

    expect(useEditingStore.getState().editingState).toBeNull();
    expect(startChatRequestMock).toHaveBeenCalledTimes(1);

    const messages = useChatSessionStore.getState().getMessagesFromPath();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(useChatSessionStore.getState().currentPath[0]).toBe(3);
  });

  it("retryFromMessage for assistant rewinds path and starts chat request", async () => {
    seedTreeWithUserAndAssistant();

    await useEditingStore.getState().retryFromMessage(2, 2);

    expect(useChatSessionStore.getState().currentPath).toEqual([1]);
    expect(useEditingStore.getState().editingState).toBeNull();
    expect(startChatRequestMock).toHaveBeenCalledTimes(1);
    const messages = useChatSessionStore.getState().getMessagesFromPath();
    expect(messages.map((m) => m.id)).toEqual([1]);
  });
});
