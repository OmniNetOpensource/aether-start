import {
  cloneAskUserQuestions,
  cloneAskUserQuestionsAnswers,
  type AskUserQuestionsAnswer,
  type AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';
import type {
  AssistantContentBlock,
  Message,
  QuoteItem,
  ResearchItem,
} from '@/shared/chat/message';
import { cloneBlocks, cloneResearchItem } from './message-tree';

type ToolLifecycleUpdate = {
  kind: 'tool_result';
  tool: string;
  result: string;
  callId: string;
};
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
    (msg): Message =>
      msg.role === 'user'
        ? { ...msg, blocks: cloneBlocks(msg.blocks) }
        : { ...msg, blocks: cloneBlocks(msg.blocks) },
  );

/** 将 quotes 转为发给模型时的引用文本格式：多行逐行以 > 开头，多条之间空一行 */
export const quotesToModelText = (quotes: QuoteItem[]): string =>
  quotes
    .map((q) =>
      q.text
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n'),
    )
    .join('\n\n');

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

  const nextBlocks = cloneBlocks(blocks);

  /** 取（或新建）末尾的 research block，用 updater 更新其 items */
  const updateResearchItems = (updater: (items: ResearchItem[]) => ResearchItem[]) => {
    const last = nextBlocks[nextBlocks.length - 1];
    if (last?.type === 'research') {
      nextBlocks[nextBlocks.length - 1] = { ...last, items: updater([...last.items]) };
    } else {
      nextBlocks.push({ type: 'research', items: updater([]) });
    }
    return nextBlocks;
  };

  const findToolLocation = (targetBlocks: AssistantContentBlock[], callId: string) => {
    for (let blockIndex = targetBlocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = targetBlocks[blockIndex];
      if (block?.type !== 'research') {
        continue;
      }

      for (let itemIndex = block.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const item = block.items[itemIndex];
        if (item?.kind === 'tool' && item.data.call.callId === callId) {
          return { blockIndex, itemIndex };
        }
      }
    }
    return null;
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
      return updateResearchItems((items) => {
        const lastItem = items[items.length - 1];
        if (lastItem?.kind === 'thinking') {
          items[items.length - 1] = { ...lastItem, text: lastItem.text + addition.text };
        } else {
          items.push({ ...addition });
        }
        return items;
      });
    }

    if (addition.kind === 'tool') {
      return updateResearchItems((items) => [...items, { ...addition }]);
    }

    if (addition.kind === 'tool_result') {
      const target = findToolLocation(nextBlocks, addition.callId);
      if (!target) {
        return updateResearchItems((items) => [
          ...items,
          {
            kind: 'tool',
            data: {
              call: { tool: addition.tool, args: {}, callId: addition.callId },
              result: { result: addition.result },
            },
          },
        ]);
      }

      const targetBlock = nextBlocks[target.blockIndex];
      if (targetBlock.type !== 'research') {
        return nextBlocks;
      }

      const targetItem = targetBlock.items[target.itemIndex];
      if (targetItem.kind !== 'tool') {
        return nextBlocks;
      }

      const items = [...targetBlock.items];
      items[target.itemIndex] = {
        ...targetItem,
        data: {
          ...targetItem.data,
          result: { result: addition.result },
        },
      };
      nextBlocks[target.blockIndex] = { ...targetBlock, items };
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
      nextBlocks.push(
        addition.error
          ? { type: 'error', message: addition.message, error: { ...addition.error } }
          : { type: 'error', message: addition.message },
      );
      return nextBlocks;
    }
  }

  return nextBlocks;
};
