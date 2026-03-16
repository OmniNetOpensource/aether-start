import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message, UserContentBlock } from "@/types/message";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useEditingStore } from "@/stores/zustand/useEditingStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";
import { MessageItem } from "./MessageItem";
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
    const peekingShell = stack?.closest(".h-0");
    const bubble = container.querySelector(
      ".rounded-lg.bg-\\(--surface-muted\\)",
    );
    const previewButton = container.querySelector(
      'button[title="photo.png (2.0 KB)"]',
    );

    expect(peekingShell).not.toBeNull();
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
});
