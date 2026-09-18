import {
  cloneAskUserQuestions,
  cloneAskUserQuestionsAnswers,
} from '@/shared/chat/ask-user-questions';
import type { BranchInfo, ContentBlock, Message, ResearchItem } from '@/shared/chat/message';

type MessageState = {
  messages: Message[];
  currentPath: number[];
  latestRootId: number | null;
  nextId: number;
};

type LinearMessageInput = {
  role: Message['role'];
  blocks: ContentBlock[];
  createdAt?: string;
};

export const cloneResearchItem = (item: ResearchItem): ResearchItem => {
  if (item.kind === 'thinking') {
    return { ...item };
  }

  return {
    kind: 'tool',
    data: {
      call: {
        ...item.data.call,
        args: { ...item.data.call.args },
      },
      result: item.data.result ? { ...item.data.result } : undefined,
    },
  };
};

export const cloneBlocks = <T extends ContentBlock>(blocks: T[]): T[] =>
  blocks.map((block) => {
    if (block.type === 'research') {
      return {
        ...block,
        items: block.items.map((item) => cloneResearchItem(item)),
      };
    }
    if (block.type === 'attachments') {
      return {
        ...block,
        attachments: block.attachments.map((attachment) => ({ ...attachment })),
      };
    }
    if (block.type === 'quotes') {
      return {
        ...block,
        quotes: block.quotes.map((q) => ({ ...q })),
      };
    }
    if (block.type === 'ask_user_questions') {
      return {
        ...block,
        questions: cloneAskUserQuestions(block.questions),
        answers: cloneAskUserQuestionsAnswers(block.answers),
      };
    }
    return { ...block };
  });

export const createEmptyMessageState = (): MessageState => ({
  messages: [],
  currentPath: [],
  latestRootId: null,
  nextId: 1,
});

const updateMessage = (
  messages: Message[],
  messageId: number,
  updater: (message: Message) => Record<string, unknown>,
) => {
  const index = messageId - 1;
  const current = messages[index];
  if (!current) {
    return;
  }
  messages[index] = updater(current) as Message;
};

const collectSiblingIds = (messages: Message[], anchorId: number | null): number[] => {
  if (anchorId === null) {
    return [];
  }

  const anchor = messages[anchorId - 1];
  if (!anchor) {
    return [];
  }

  let leftmostId = anchorId;
  const leftVisited = new Set<number>([anchorId]);

  while (true) {
    const current: Message | undefined = messages[leftmostId - 1];
    if (!current || current.prevSibling === null) {
      break;
    }

    if (leftVisited.has(current.prevSibling)) {
      break;
    }

    leftmostId = current.prevSibling;
    leftVisited.add(leftmostId);
  }

  const siblingIds: number[] = [];
  const rightVisited = new Set<number>();
  let currentId: number | null = leftmostId;

  while (currentId !== null) {
    if (rightVisited.has(currentId)) {
      break;
    }

    const current: Message | undefined = messages[currentId - 1];
    if (!current) {
      break;
    }

    siblingIds.push(currentId);
    rightVisited.add(currentId);
    currentId = current.nextSibling;
  }

  return siblingIds;
};

export const normalizeMessageParentIds = (messages: Message[]): Message[] => {
  if (messages.length === 0) {
    return [];
  }

  const normalized = messages.map(
    (message) =>
      ({
        ...message,
        parentId: null,
        completedAt:
          'completedAt' in message && typeof message.completedAt === 'string'
            ? message.completedAt
            : null,
      }) as Message,
  );

  for (const message of normalized) {
    const childIds = collectSiblingIds(normalized, message.latestChild);
    for (const childId of childIds) {
      updateMessage(normalized, childId, () => ({
        ...normalized[childId - 1],
        parentId: message.id,
      }));
    }
  }

  return normalized;
};

export const buildCurrentPath = (messages: Message[], latestRootId: number | null): number[] => {
  const path: number[] = [];
  let currentId = latestRootId;

  while (currentId !== null) {
    const current = messages[currentId - 1];
    if (!current) {
      break;
    }
    path.push(currentId);
    currentId = current.latestChild;
  }

  return path;
};

/**
 * 打开历史会话时的默认路径:以最新的 assistant 消息(id 最大,即最后创建)所在分支为准;
 * 树里没有 assistant 时退化为 id 最大的消息。路径不持久化,由客户端每次重建。
 */
export const buildPathToLatestAssistant = (messages: Message[]): number[] => {
  let anchor: Message | null = null;
  for (const message of messages) {
    if (message.role === 'assistant') {
      anchor = message;
    }
  }
  anchor ??= messages.at(-1) ?? null;

  const path: number[] = [];
  let currentId: number | null = anchor?.id ?? null;
  while (currentId !== null) {
    const current: Message | undefined = messages[currentId - 1];
    if (!current || path.length > messages.length) {
      return [];
    }
    path.unshift(currentId);
    currentId = current.parentId;
  }
  return path;
};

export const computeMessagesFromPath = (messages: Message[], currentPath: number[]): Message[] =>
  currentPath.map((id) => messages[id - 1]).filter((message): message is Message => !!message);

export const addMessage = (
  state: MessageState,
  role: Message['role'],
  blocks: ContentBlock[],
  createdAt = new Date().toISOString(),
): MessageState & { addedMessage: Message } => {
  const { messages, currentPath, latestRootId, nextId } = state;
  const parentId = currentPath[currentPath.length - 1] ?? null;
  const id = nextId;

  const nextMessages = [...messages];

  const newMessage = {
    id,
    parentId,
    role,
    blocks,
    prevSibling: null,
    nextSibling: null,
    latestChild: null,
    createdAt,
    completedAt: null,
  } as Message;

  if (parentId !== null) {
    const parent = nextMessages[parentId - 1];
    if (parent) {
      if (parent.latestChild !== null) {
        const prevSibling = nextMessages[parent.latestChild - 1];
        if (prevSibling) {
          updateMessage(nextMessages, prevSibling.id, (message) => ({
            ...message,
            nextSibling: id,
          }));
          newMessage.prevSibling = prevSibling.id;
        }
      }
      updateMessage(nextMessages, parentId, (message) => ({
        ...message,
        latestChild: id,
      }));
    }
  } else {
    if (latestRootId !== null) {
      const prevSibling = nextMessages[latestRootId - 1];
      if (prevSibling) {
        updateMessage(nextMessages, prevSibling.id, (message) => ({
          ...message,
          nextSibling: id,
        }));
        newMessage.prevSibling = prevSibling.id;
      }
    }
  }

  nextMessages.push(newMessage);

  return {
    messages: nextMessages,
    currentPath: [...currentPath, id],
    latestRootId: parentId === null ? id : latestRootId,
    nextId: id + 1,
    addedMessage: newMessage,
  };
};

export const switchBranch = (
  state: MessageState,
  depth: number,
  newNodeId: number,
): MessageState => {
  const { messages, currentPath, latestRootId, nextId } = state;
  const target = messages[newNodeId - 1];
  if (!target) {
    return state;
  }

  const nextMessages = [...messages];
  const prefix = depth > 1 ? currentPath.slice(0, depth - 1) : [];
  const nextPath = [...prefix, newNodeId];

  let current = target;
  while (current.latestChild !== null) {
    nextPath.push(current.latestChild);
    const next = nextMessages[current.latestChild - 1];
    if (!next) {
      break;
    }
    current = next;
  }

  let nextLatestRootId = latestRootId;
  if (depth > 1) {
    const parentId = nextPath[depth - 2];
    if (parentId) {
      updateMessage(nextMessages, parentId, (message) => ({
        ...message,
        latestChild: newNodeId,
      }));
    }
  } else {
    nextLatestRootId = newNodeId;
  }

  return {
    messages: nextMessages,
    currentPath: nextPath,
    latestRootId: nextLatestRootId,
    nextId,
  };
};

export const getBranchInfo = (messages: Message[], messageId: number): BranchInfo | null => {
  const msg = messages[messageId - 1];
  if (!msg) {
    return null;
  }

  const siblings: number[] = [];

  let leftId = msg.prevSibling;
  while (leftId !== null) {
    siblings.unshift(leftId);
    leftId = messages[leftId - 1]?.prevSibling ?? null;
  }

  siblings.push(messageId);

  let rightId = msg.nextSibling;
  while (rightId !== null) {
    siblings.push(rightId);
    rightId = messages[rightId - 1]?.nextSibling ?? null;
  }

  if (siblings.length <= 1) {
    return null;
  }

  return {
    currentIndex: siblings.indexOf(messageId),
    total: siblings.length,
    siblingIds: siblings,
  };
};

export const editMessage = (
  state: MessageState,
  depth: number,
  messageId: number,
  newBlocks: ContentBlock[],
): (MessageState & { addedMessage: Message }) | null => {
  const { messages, currentPath, latestRootId, nextId } = state;
  const target = messages[messageId - 1];
  if (!target) {
    return null;
  }

  const id = nextId;
  const newMessage = {
    id,
    parentId: target.parentId,
    role: target.role,
    blocks: newBlocks,
    prevSibling: messageId,
    nextSibling: target.nextSibling,
    latestChild: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  } as Message;

  const nextMessages = [...messages];

  if (target.nextSibling !== null) {
    updateMessage(nextMessages, target.nextSibling, (message) => ({
      ...message,
      prevSibling: id,
    }));
  }

  updateMessage(nextMessages, messageId, (message) => ({
    ...message,
    nextSibling: id,
  }));

  nextMessages.push(newMessage);

  const switched = switchBranch(
    {
      messages: nextMessages,
      currentPath,
      latestRootId,
      nextId: id + 1,
    },
    depth,
    id,
  );

  return {
    ...switched,
    nextId: id + 1,
    addedMessage: newMessage,
  };
};

export const createLinearMessages = (items: LinearMessageInput[]): MessageState => {
  if (items.length === 0) {
    return createEmptyMessageState();
  }

  const messages: Message[] = [];
  const currentPath: number[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const id = index + 1;
    const item = items[index];
    const createdAt = item.createdAt ?? new Date().toISOString();

    messages.push({
      id,
      parentId: index > 0 ? id - 1 : null,
      role: item.role,
      blocks: cloneBlocks(item.blocks ?? []),
      prevSibling: null,
      nextSibling: null,
      latestChild: index < items.length - 1 ? id + 1 : null,
      createdAt,
      completedAt: null,
    } as Message);
    currentPath.push(id);
  }

  return {
    messages,
    currentPath,
    latestRootId: messages.length > 0 ? messages[0].id : null,
    nextId: messages.length + 1,
  };
};
