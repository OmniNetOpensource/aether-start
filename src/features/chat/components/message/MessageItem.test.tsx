import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, UserContentBlock } from "@/types/message";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useEditingStore } from "@/stores/zustand/useEditingStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";
import { MessageItem } from "./MessageItem";
import { MessageList } from "./MessageList";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/Markdown", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("../research/ResearchBlock", () => ({
  ResearchBlock: () => <div>Research block</div>,
}));

vi.mock("./MessageEditor", () => ({
  MessageEditor: () => <div>Message editor</div>,
}));

vi.mock("./BranchNavigator", () => ({
  BranchNavigator: () => <div>Branch navigator</div>,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children?: React.ReactNode;
    }) => <div {...props}>{children}</div>,
  },
}));

vi.mock("./selection-toolbar", () => ({
  SelectionToolbar: () => null,
}));

vi.mock("@/components/ResponsiveContext", () => ({
  useResponsive: () => "mobile",
}));

vi.mock("@/features/chat/components/message/outline", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@/features/chat/components/message/outline")
    >();
  return {
    ...mod,
    OutlineButton: () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open conversation outline"
          >
            Outline
          </button>
          {open && (
            <div data-outline-dialog role="dialog">
              Outline dialog
            </div>
          )}
        </>
      );
    },
  };
});

function createAttachment(id: string) {
  return {
    id,
    kind: "image" as const,
    name: `${id}.png`,
    size: 2048,
    mimeType: "image/png",
    url: `https://example.com/${id}-full.png`,
    thumbnailUrl: `https://example.com/${id}-thumb.png`,
  };
}

function createUserMessage(blocks: UserContentBlock[]): Message {
  return {
    id: 1,
    role: "user",
    parentId: null,
    prevSibling: null,
    nextSibling: null,
    latestChild: null,
    createdAt: "2026-03-13T00:00:00.000Z",
    blocks,
  };
}

function createAssistantMessage(id: number, content: string): Message {
  return {
    id,
    role: "assistant",
    parentId: 1,
    prevSibling: null,
    nextSibling: null,
    latestChild: null,
    createdAt: "2026-03-13T00:00:01.000Z",
    blocks: [{ type: "content", content }],
  };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("MessageItem", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    useChatRequestStore.setState({ status: "idle" });
    useEditingStore.setState({ editingState: null });
    useChatSessionStore.setState({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flush();
    });

    container.remove();
    document.body.innerHTML = "";
  });

  it("renders peeking attachments above the user bubble when text exists", async () => {
    const attachment = createAttachment("photo");

    useChatSessionStore.setState({
      messages: [
        createUserMessage([
          { type: "attachments", attachments: [attachment] },
          { type: "content", content: "hello world" },
        ]),
      ],
      currentPath: [1],
      latestRootId: 1,
      nextId: 2,
    });

    await act(async () => {
      root.render(
        <MessageItem messageId={1} index={0} depth={1} isStreaming={false} />,
      );
      await flush();
    });

    const stack = container.querySelector('[data-testid="attachment-stack"]');
    const bubble = container.querySelector(
      ".rounded-lg.bg-\\(--surface-muted\\)",
    );
    const previewButton = container.querySelector(
      'button[title="photo.png (2.0 KB)"]',
    );

    expect(stack).not.toBeNull();
    expect(bubble).not.toBeNull();
    expect(previewButton).not.toBeNull();
  });

  it("keeps the bubble and preview interaction when the message only has attachments", async () => {
    const attachment = createAttachment("solo");

    useChatSessionStore.setState({
      messages: [
        createUserMessage([{ type: "attachments", attachments: [attachment] }]),
      ],
      currentPath: [1],
      latestRootId: 1,
      nextId: 2,
    });

    await act(async () => {
      root.render(
        <MessageItem messageId={1} index={0} depth={1} isStreaming={false} />,
      );
      await flush();
    });

    const stack = container.querySelector('[data-testid="attachment-stack"]');
    const previewButton = container.querySelector(
      'button[title="solo.png (2.0 KB)"]',
    ) as HTMLButtonElement | null;

    expect(stack).not.toBeNull();
    expect(
      container.querySelector(".rounded-lg.bg-\\(--surface-muted\\)"),
    ).not.toBeNull();

    await act(async () => {
      previewButton?.click();
      await flush();
    });

    expect(
      document.body.querySelector(
        'img[src="https://example.com/solo-full.png"]',
      ),
    ).not.toBeNull();
  });

  it("renders quote cards for user message with quotes block", async () => {
    useChatSessionStore.setState({
      messages: [
        createUserMessage([
          { type: "quotes", quotes: [{ id: "q1", text: "quoted text" }] },
          { type: "content", content: "my question" },
        ]),
      ],
      currentPath: [1],
      latestRootId: 1,
      nextId: 2,
    });

    await act(async () => {
      root.render(
        <MessageItem messageId={1} index={0} depth={1} isStreaming={false} />,
      );
      await flush();
    });

    const stack = container.querySelector('[data-testid="attachment-stack"]');
    expect(stack).not.toBeNull();
    expect(stack?.textContent).toContain("quoted text");
    const bubble = container.querySelector(
      ".rounded-lg.bg-\\(--surface-muted\\)",
    );
    expect(bubble).not.toBeNull();
    expect(bubble?.textContent).toContain("my question");
  });

  it("renders bubble for quote-only user message without duplicating quote in content", async () => {
    useChatSessionStore.setState({
      messages: [
        createUserMessage([
          { type: "quotes", quotes: [{ id: "q1", text: "only quote" }] },
        ]),
      ],
      currentPath: [1],
      latestRootId: 1,
      nextId: 2,
    });

    await act(async () => {
      root.render(
        <MessageItem messageId={1} index={0} depth={1} isStreaming={false} />,
      );
      await flush();
    });

    const stack = container.querySelector('[data-testid="attachment-stack"]');
    expect(stack).not.toBeNull();
    expect(stack?.textContent).toContain("only quote");
    expect(container.textContent).not.toContain("> only quote");
  });
});

describe("MessageList rail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.appendChild(container);
    root = createRoot(container);

    useChatRequestStore.setState({ status: "idle" });
    useEditingStore.setState({ editingState: null });
    useChatSessionStore.setState({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flush();
    });

    container.remove();
    document.body.innerHTML = "";
  });

  it("renders rail collapsed by default and expands on click", async () => {
    useChatSessionStore.setState({
      messages: [
        createUserMessage([{ type: "content", content: "hi" }]),
        createAssistantMessage(2, "hello"),
      ],
      currentPath: [1, 2],
      latestRootId: 1,
      nextId: 3,
    });

    await act(async () => {
      root.render(
        <div style={{ width: 800, height: 600 }}>
          <MessageList />

        </div>,
      );
      await flush();
    });

    const rail = container.querySelector("[data-chat-actions-rail]");
    expect(rail).not.toBeNull();

    const expandButtons = container.querySelectorAll(
      '[aria-label="展开聊天操作"]',
    );
    expect(expandButtons.length).toBeGreaterThan(0);

    const toggleBtn = container.querySelector(
      '[aria-label="展开聊天操作"]',
    ) as HTMLButtonElement;

    expect(container.querySelector('[aria-label="Previous message"]')).toBeNull();

    await act(async () => {
      toggleBtn?.click();
      await flush();
    });

    expect(
      container.querySelector('[aria-label="展开聊天操作"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="Previous message"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Next message"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Scroll to bottom"]')).not.toBeNull();
  });

  it("shows four actions in order: outline, previous, next, bottom", async () => {
    useChatSessionStore.setState({
      messages: [
        createUserMessage([{ type: "content", content: "hi" }]),
        createAssistantMessage(2, "hello"),
      ],
      currentPath: [1, 2],
      latestRootId: 1,
      nextId: 3,
    });

    await act(async () => {
      root.render(
        <div style={{ width: 800, height: 600 }}>
          <MessageList />
        </div>,
      );
      await flush();
    });

    const toggleBtn = container.querySelector(
      '[aria-label="展开聊天操作"]',
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn?.click();
      await flush();
    });

    const buttons = container.querySelectorAll(
      "[data-chat-actions-rail] [data-slot='button'], [data-chat-actions-rail] button[aria-label]",
    );
    const labels = Array.from(buttons)
      .map((b) => b.getAttribute("aria-label"))
      .filter(Boolean);
    expect(labels).toContain("Open conversation outline");
    expect(labels).toContain("Previous message");
    expect(labels).toContain("Next message");
    expect(labels).toContain("Scroll to bottom");
  });

  it("disables outline, previous, next when path is empty", async () => {
    useChatSessionStore.setState({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    });

    await act(async () => {
      root.render(
        <div style={{ width: 800, height: 600 }}>
          <MessageList />
        </div>,
      );
      await flush();
    });

    const toggleBtn = container.querySelector(
      '[aria-label="展开聊天操作"]',
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn?.click();
      await flush();
    });

    const outlineBtn = container.querySelector(
      '[aria-label="Open conversation outline"]',
    ) as HTMLButtonElement;
    const prevBtn = container.querySelector(
      '[aria-label="Previous message"]',
    ) as HTMLButtonElement;
    const nextBtn = container.querySelector(
      '[aria-label="Next message"]',
    ) as HTMLButtonElement;

    expect(outlineBtn?.disabled ?? true).toBe(true);
    expect(prevBtn?.disabled ?? true).toBe(true);
    expect(nextBtn?.disabled ?? true).toBe(true);
  });

  it("disables previous and next when path has single message", async () => {
    useChatSessionStore.setState({
      messages: [createUserMessage([{ type: "content", content: "hi" }])],
      currentPath: [1],
      latestRootId: 1,
      nextId: 2,
    });

    await act(async () => {
      root.render(
        <div style={{ width: 800, height: 600 }}>
          <MessageList />
        </div>,
      );
      await flush();
    });

    const toggleBtn = container.querySelector(
      '[aria-label="展开聊天操作"]',
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn?.click();
      await flush();
    });

    const prevBtn = container.querySelector(
      '[aria-label="Previous message"]',
    ) as HTMLButtonElement;
    const nextBtn = container.querySelector(
      '[aria-label="Next message"]',
    ) as HTMLButtonElement;

    expect(prevBtn?.disabled ?? true).toBe(true);
    expect(nextBtn?.disabled ?? true).toBe(true);
  });

  it("bottom button scrolls container to scrollHeight", async () => {
    const scrollToMock = vi.fn();
    useChatSessionStore.setState({
      messages: [
        createUserMessage([{ type: "content", content: "hi" }]),
        createAssistantMessage(2, "hello"),
      ],
      currentPath: [1, 2],
      latestRootId: 1,
      nextId: 3,
    });

    await act(async () => {
      root.render(
        <div style={{ width: 800, height: 600 }}>
          <MessageList />
        </div>,
      );
      await flush();
    });

    const scrollContainer = container.querySelector(".overflow-y-auto");
    if (scrollContainer) {
      scrollContainer.scrollTo = scrollToMock;
    }

    const toggleBtn = container.querySelector(
      '[aria-label="展开聊天操作"]',
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn?.click();
      await flush();
    });

    const bottomBtn = container.querySelector(
      '[aria-label="Scroll to bottom"]',
    ) as HTMLButtonElement;
    await act(async () => {
      bottomBtn?.click();
      await flush();
    });

    expect(scrollToMock).toHaveBeenCalledWith({
      top: expect.any(Number),
      behavior: "smooth",
    });
  });

  it("outline action opens the outline dialog", async () => {
    useChatSessionStore.setState({
      messages: [
        createUserMessage([{ type: "content", content: "hi" }]),
        createAssistantMessage(2, "hello"),
      ],
      currentPath: [1, 2],
      latestRootId: 1,
      nextId: 3,
    });

    await act(async () => {
      root.render(
        <div style={{ width: 800, height: 600 }}>
          <MessageList />
        </div>,
      );
      await flush();
    });

    const toggleBtn = container.querySelector(
      '[aria-label="展开聊天操作"]',
    ) as HTMLButtonElement;
    await act(async () => {
      toggleBtn?.click();
      await flush();
    });

    const outlineBtn = container.querySelector(
      '[aria-label="Open conversation outline"]',
    ) as HTMLButtonElement;
    expect(outlineBtn).not.toBeNull();

    await act(async () => {
      outlineBtn?.click();
      await flush();
    });

    expect(document.body.querySelector("[data-outline-dialog]")).not.toBeNull();
  });
});
