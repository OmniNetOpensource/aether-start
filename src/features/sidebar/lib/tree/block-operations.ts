import type {
  AssistantContentBlock,
  Attachment,
  ContentBlock,
  Message,
  ResearchItem,
  ToolProgress,
  UserContentBlock,
} from "@/types/message";
import { cloneBlocks, cloneResearchItem } from "./message-tree";

type ToolLifecycleUpdate =
  | ({ kind: "tool_progress"; tool: string } & ToolProgress)
  | { kind: "tool_result"; tool: string; result: string };

export type AssistantAddition = AssistantContentBlock | ResearchItem | ToolLifecycleUpdate;

export const cloneMessages = (messages: Message[]): Message[] =>
  messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    blocks: cloneBlocks(msg.blocks ?? []),
    prevSibling: msg.prevSibling,
    nextSibling: msg.nextSibling,
    latestChild: msg.latestChild,
    createdAt: msg.createdAt,
  } as Message));

export const extractContentFromBlocks = (blocks: ContentBlock[]) =>
  blocks
    .filter((block) => block.type === "content")
    .map((block) => block.content)
    .join("\n\n");

export const extractAttachmentsFromBlocks = (blocks: ContentBlock[]) =>
  blocks.flatMap((block) =>
    block.type === "attachments" ? block.attachments : []
  );

export const collectAttachmentIds = (blocks: ContentBlock[]) =>
  new Set(
    blocks.flatMap((block) =>
      block.type === "attachments"
        ? block.attachments.map((attachment) => attachment.id)
        : []
    )
  );

export const buildUserBlocks = (
  content: string,
  attachments: Attachment[]
): UserContentBlock[] => {
  const blocks: UserContentBlock[] = [];
  const trimmed = content.trim();
  if (trimmed) {
    blocks.push({ type: "content", content: trimmed });
  }
  if (attachments.length > 0) {
    blocks.push({ type: "attachments", attachments });
  }
  return blocks;
};

export const applyAssistantAddition = (
  blocks: AssistantContentBlock[],
  addition: AssistantAddition
): AssistantContentBlock[] => {
  // Fast path: content append (hot path during text streaming)
  if ("type" in addition && addition.type === "content") {
    const text = addition.content;
    if (!text) return blocks;
    const last = blocks[blocks.length - 1];
    if (last?.type === "content") {
      const next = blocks.slice();
      next[next.length - 1] = { ...last, content: last.content + text };
      return next;
    }
    return [...blocks, { type: "content" as const, content: text }];
  }

  const nextBlocks = cloneBlocks(blocks ?? []) as AssistantContentBlock[];

  const ensureResearchBlock = (targetBlocks: AssistantContentBlock[]) => {
    const lastBlock = targetBlocks[targetBlocks.length - 1];
    if (!lastBlock || lastBlock.type !== "research") {
      targetBlocks.push({ type: "research", items: [] });
      return targetBlocks.length - 1;
    }
    return targetBlocks.length - 1;
  };

  const findToolIndex = (items: ResearchItem[], toolName: string) => {
    let fallback = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind === "tool" && item.data.call.tool === toolName) {
        if (!item.data.result) {
          return i;
        }
        if (fallback === -1) {
          fallback = i;
        }
      }
    }
    return fallback;
  };

  if ("kind" in addition) {
    if (addition.kind === "thinking") {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: "research" }
      >;
      const items = [...researchBlock.items];
      const lastItem = items[items.length - 1];

      if (lastItem?.kind === "thinking") {
        items[items.length - 1] = {
          ...lastItem,
          text: lastItem.text + addition.text,
        };
      } else {
        items.push({ ...addition });
      }

      nextBlocks[researchIndex] = { ...researchBlock, items };
      return nextBlocks;
    }

    if (addition.kind === "tool") {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: "research" }
      >;

      nextBlocks[researchIndex] = {
        ...researchBlock,
        items: [...researchBlock.items, { ...addition }],
      };
      return nextBlocks;
    }

    if (addition.kind === "tool_progress") {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: "research" }
      >;
      const items = [...researchBlock.items];
      const targetIndex = findToolIndex(items, addition.tool);
      const progressEntry: ToolProgress = {
        stage: addition.stage,
        message: addition.message,
        receivedBytes: addition.receivedBytes,
        totalBytes: addition.totalBytes,
      };

      if (targetIndex === -1) {
        items.push({
          kind: "tool",
          data: {
            call: { tool: addition.tool, args: {} },
            progress: [progressEntry],
          },
        });
      } else {
        const targetItem = items[targetIndex];
        if (targetItem.kind === "tool") {
          items[targetIndex] = {
            ...targetItem,
            data: {
              ...targetItem.data,
              progress: [
                ...(targetItem.data.progress ?? []),
                progressEntry,
              ],
            },
          };
        }
      }

      nextBlocks[researchIndex] = { ...researchBlock, items };
      return nextBlocks;
    }

    if (addition.kind === "tool_result") {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: "research" }
      >;
      const items = [...researchBlock.items];
      const targetIndex = findToolIndex(items, addition.tool);

      if (targetIndex === -1) {
        items.push({
          kind: "tool",
          data: {
            call: { tool: addition.tool, args: {} },
            result: { result: addition.result },
          },
        });
      } else {
        const targetItem = items[targetIndex];
        if (targetItem.kind === "tool") {
          items[targetIndex] = {
            ...targetItem,
            data: {
              ...targetItem.data,
              result: { result: addition.result },
            },
          };
        }
      }

      nextBlocks[researchIndex] = { ...researchBlock, items };
      return nextBlocks;
    }
  }

  if ("type" in addition) {
    if (addition.type === "research") {
      const normalizedItems = addition.items.map((item) =>
        item.kind === "thinking" ? { ...item } : cloneResearchItem(item)
      );
      nextBlocks.push({
        type: "research",
        items: normalizedItems,
      });
      return nextBlocks;
    }

    if (addition.type === "error") {
      nextBlocks.push({ type: "error", message: addition.message });
      return nextBlocks;
    }
  }

  return nextBlocks;
};
