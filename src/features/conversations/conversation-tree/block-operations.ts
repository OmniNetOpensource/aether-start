import {
  cloneAskUserQuestions,
  cloneAskUserQuestionsAnswers,
  type AskUserQuestionsAnswer,
  type AskUserQuestionsQuestion,
} from '@/features/chat/ask-user-questions/ask-user-questions';
import type {
  AssistantContentBlock,
  Attachment,
  ContentBlock,
  Message,
  QuoteItem,
  ResearchItem,
  UserContentBlock,
} from '@/features/chat/message-thread';
import { cloneBlocks, cloneResearchItem } from './message-tree';

type ToolLifecycleUpdate = { kind: 'tool_result'; tool: string; result: string };
type AskUserQuestionsRequested = {
  kind: 'ask_user_questions_requested';
  callId: string;
  questions: AskUserQuestionsQuestion[];
};
type AskUserQuestionsStatusUpdate = {
  kind: 'ask_user_questions_status';
  callId: string;
  status: 'pending' | 'submitting';
};
type AskUserQuestionsAnswered = {
  kind: 'ask_user_questions_answered';
  callId: string;
  answers: AskUserQuestionsAnswer[];
};

export type AssistantAddition =
  | AssistantContentBlock
  | ResearchItem
  | ToolLifecycleUpdate
  | AskUserQuestionsRequested
  | AskUserQuestionsStatusUpdate
  | AskUserQuestionsAnswered;

export const cloneMessages = (messages: Message[]): Message[] =>
  messages.map(
    (msg) =>
      ({
        id: msg.id,
        parentId: msg.parentId,
        role: msg.role,
        blocks: cloneBlocks(msg.blocks ?? []),
        prevSibling: msg.prevSibling,
        nextSibling: msg.nextSibling,
        latestChild: msg.latestChild,
        createdAt: msg.createdAt,
      }) as Message,
  );

export const extractContentFromBlocks = (blocks: ContentBlock[]) =>
  blocks
    .filter((block) => block.type === 'content')
    .map((block) => block.content)
    .join('\n\n');

export const extractQuotesFromBlocks = (blocks: ContentBlock[]) =>
  blocks.flatMap((block) => (block.type === 'quotes' ? block.quotes : []));

/** �?quotes 转为发给模型时的引用文本格式：多行逐行�?>，多条之间空一�?*/
export const quotesToModelText = (quotes: QuoteItem[]): string =>
  quotes
    .map((q) =>
      q.text
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n'),
    )
    .join('\n\n');

export const extractAttachmentsFromBlocks = (blocks: ContentBlock[]) =>
  blocks.flatMap((block) => (block.type === 'attachments' ? block.attachments : []));

export const collectAttachmentIds = (blocks: ContentBlock[]) =>
  new Set(
    blocks.flatMap((block) =>
      block.type === 'attachments' ? block.attachments.map((attachment) => attachment.id) : [],
    ),
  );

export const buildUserBlocks = (
  content: string,
  quotes: QuoteItem[],
  attachments: Attachment[],
): UserContentBlock[] => {
  const blocks: UserContentBlock[] = [];
  if (quotes.length > 0) {
    blocks.push({ type: 'quotes', quotes });
  }
  if (attachments.length > 0) {
    blocks.push({ type: 'attachments', attachments });
  }
  const trimmed = content.trim();
  if (trimmed) {
    blocks.push({ type: 'content', content: trimmed });
  }
  return blocks;
};

export const applyAssistantAddition = (
  blocks: AssistantContentBlock[],
  addition: AssistantAddition,
): AssistantContentBlock[] => {
  // Fast path: content append (hot path during text streaming)
  if ('type' in addition && addition.type === 'content') {
    const text = addition.content;
    if (!text) return blocks;
    const last = blocks[blocks.length - 1];
    if (last?.type === 'content') {
      const next = blocks.slice();
      next[next.length - 1] = { ...last, content: last.content + text };
      return next;
    }
    return [...blocks, { type: 'content' as const, content: text }];
  }

  const nextBlocks = cloneBlocks(blocks ?? []) as AssistantContentBlock[];

  const ensureResearchBlock = (targetBlocks: AssistantContentBlock[]) => {
    const lastBlock = targetBlocks[targetBlocks.length - 1];
    if (!lastBlock || lastBlock.type !== 'research') {
      targetBlocks.push({ type: 'research', items: [] });
      return targetBlocks.length - 1;
    }
    return targetBlocks.length - 1;
  };

  const findToolIndex = (items: ResearchItem[], toolName: string) => {
    let fallback = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind === 'tool' && item.data.call.tool === toolName) {
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

  const findAskUserQuestionsIndex = (targetBlocks: AssistantContentBlock[], callId: string) => {
    for (let i = targetBlocks.length - 1; i >= 0; i -= 1) {
      const block = targetBlocks[i];
      if (block?.type === 'ask_user_questions' && block.callId === callId) {
        return i;
      }
    }

    return -1;
  };

  if ('kind' in addition) {
    if (addition.kind === 'thinking') {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: 'research' }
      >;
      const items = [...researchBlock.items];
      const lastItem = items[items.length - 1];

      if (lastItem?.kind === 'thinking') {
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

    if (addition.kind === 'tool') {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: 'research' }
      >;

      nextBlocks[researchIndex] = {
        ...researchBlock,
        items: [...researchBlock.items, { ...addition }],
      };
      return nextBlocks;
    }

    if (addition.kind === 'tool_result') {
      const researchIndex = ensureResearchBlock(nextBlocks);
      const researchBlock = nextBlocks[researchIndex] as Extract<
        AssistantContentBlock,
        { type: 'research' }
      >;
      const items = [...researchBlock.items];
      const targetIndex = findToolIndex(items, addition.tool);

      if (targetIndex === -1) {
        items.push({
          kind: 'tool',
          data: {
            call: { tool: addition.tool, args: {} },
            result: { result: addition.result },
          },
        });
      } else {
        const targetItem = items[targetIndex];
        if (targetItem.kind === 'tool') {
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

    if (addition.kind === 'ask_user_questions_requested') {
      const targetIndex = findAskUserQuestionsIndex(nextBlocks, addition.callId);
      const nextBlock = {
        type: 'ask_user_questions' as const,
        callId: addition.callId,
        questions: cloneAskUserQuestions(addition.questions),
        status: 'pending' as const,
        answers: [],
      };

      if (targetIndex === -1) {
        nextBlocks.push(nextBlock);
      } else {
        nextBlocks[targetIndex] = nextBlock;
      }

      return nextBlocks;
    }

    if (addition.kind === 'ask_user_questions_status') {
      const targetIndex = findAskUserQuestionsIndex(nextBlocks, addition.callId);
      if (targetIndex === -1) {
        return nextBlocks;
      }

      const targetBlock = nextBlocks[targetIndex];
      if (targetBlock.type !== 'ask_user_questions') {
        return nextBlocks;
      }

      nextBlocks[targetIndex] = {
        ...targetBlock,
        status: addition.status,
      };
      return nextBlocks;
    }

    if (addition.kind === 'ask_user_questions_answered') {
      const targetIndex = findAskUserQuestionsIndex(nextBlocks, addition.callId);
      if (targetIndex === -1) {
        return nextBlocks;
      }

      const targetBlock = nextBlocks[targetIndex];
      if (targetBlock.type !== 'ask_user_questions') {
        return nextBlocks;
      }

      nextBlocks[targetIndex] = {
        ...targetBlock,
        status: 'answered',
        answers: cloneAskUserQuestionsAnswers(addition.answers),
      };
      return nextBlocks;
    }
  }

  if ('type' in addition) {
    if (addition.type === 'research') {
      const normalizedItems = addition.items.map((item) =>
        item.kind === 'thinking' ? { ...item } : cloneResearchItem(item),
      );
      nextBlocks.push({
        type: 'research',
        items: normalizedItems,
      });
      return nextBlocks;
    }

    if (addition.type === 'error') {
      nextBlocks.push({ type: 'error', message: addition.message });
      return nextBlocks;
    }
  }

  return nextBlocks;
};
