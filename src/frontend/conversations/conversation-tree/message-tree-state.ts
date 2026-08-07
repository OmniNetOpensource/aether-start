import { createStore } from 'solid-js';
import {
  addMessage as addMessageToTree,
  buildCurrentPath,
  computeMessagesFromPath,
  createEmptyMessageState,
  createLinearMessages,
  editMessage as editMessageInTree,
  getBranchInfo,
  normalizeMessageParentIds,
  switchBranch,
} from '@/shared/conversations/message-tree';
import type { AssistantAddition } from '@/shared/conversations/block-operations';
import type {
  AssistantContentBlock,
  BranchInfo,
  ContentBlock,
  Message,
  ResearchItem,
  UserMessage,
} from '@/shared/chat/message';

export type MessageTreeState = ReturnType<typeof createEmptyMessageState>;

const [messageTree, setMessageTree] = createStore<MessageTreeState>(createEmptyMessageState());

export const messages = () => messageTree.messages;
export const currentPath = () => messageTree.currentPath;
export const latestRootId = () => messageTree.latestRootId;
export const nextMessageId = () => messageTree.nextId;
export const getMessageTreeState = () => messageTree;

// 用纯函数计算出的完整状态整体覆盖 store。顶层 4 个 key 逐一写入,
// messages 按下标替换——未变化的元素引用相同,不会触发订阅者。
const replaceTree = (next: MessageTreeState) =>
  setMessageTree(() => ({
    messages: next.messages,
    currentPath: next.currentPath,
    latestRootId: next.latestRootId,
    nextId: next.nextId,
  }));

export const clearMessageTree = () => replaceTree(createEmptyMessageState());

export const setMessages = (nextMessages: Message[]) => {
  replaceTree(
    createLinearMessages(
      nextMessages.map((message) => ({
        role: message.role,
        blocks: message.blocks ?? [],
        createdAt: message.createdAt,
      })),
    ),
  );
};

export const initializeMessageTree = (
  nextMessages: Message[] = [],
  nextCurrentPath: number[] = [],
) => {
  const normalizedMessages = normalizeMessageParentIds(nextMessages);
  const fallbackRootId = normalizedMessages[0]?.id ?? null;
  const resolvedPath =
    nextCurrentPath.length > 0
      ? nextCurrentPath
      : buildCurrentPath(normalizedMessages, fallbackRootId);

  replaceTree({
    messages: normalizedMessages,
    currentPath: resolvedPath,
    latestRootId: resolvedPath[0] ?? fallbackRootId,
    nextId: normalizedMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1,
  });
};

export const getMessagesFromPath = () =>
  computeMessagesFromPath(messageTree.messages, messageTree.currentPath);

export const selectMessage = (messageId: number) => {
  const targetPath: number[] = [];
  const visited = new Set<number>();
  let currentId: number | null = messageId;

  while (currentId !== null) {
    if (visited.has(currentId)) return;
    const currentMessage: Message | undefined = messageTree.messages[currentId - 1];
    if (!currentMessage) return;
    targetPath.push(currentId);
    visited.add(currentId);
    currentId = currentMessage.parentId;
  }

  targetPath.reverse();
  let nextState: MessageTreeState = messageTree;
  for (let index = 0; index < targetPath.length; index += 1) {
    nextState = switchBranch(nextState, index + 1, targetPath[index]);
  }
  replaceTree(nextState);
};

// 流式热路径:直接在 store draft 上做细粒度原地修改,
// 只让依赖具体字段(如正在增长的 content)的订阅者失效。
export const appendToAssistant = (addition: AssistantAddition) => {
  const lastId = messageTree.currentPath.at(-1) ?? null;
  const lastMessage = lastId ? messageTree.messages[lastId - 1] : null;
  let assistantId = lastId;

  if (!lastMessage || lastMessage.role !== 'assistant') {
    const result = addMessageToTree(messageTree, 'assistant', []);
    assistantId = result.addedMessage.id;
    replaceTree(result);
  }
  if (!assistantId) return;
  const targetId = assistantId;

  setMessageTree((state) => {
    const target = state.messages[targetId - 1];
    if (!target || target.role !== 'assistant') return;
    applyAdditionInPlace(target.blocks, addition);
  });
};

// 返回末尾 research 块的 items,没有就补一个
const researchItems = (blocks: AssistantContentBlock[]): ResearchItem[] => {
  const last = blocks.at(-1);
  if (last?.type === 'research') return last.items;
  const items: ResearchItem[] = [];
  blocks.push({ type: 'research', items });
  return items;
};

const applyAdditionInPlace = (blocks: AssistantContentBlock[], addition: AssistantAddition) => {
  if (!('kind' in addition)) {
    if (addition.type === 'content') {
      if (!addition.content) return;
      const last = blocks.at(-1);
      if (last?.type === 'content') {
        last.content += addition.content;
      } else {
        blocks.push({ type: 'content', content: addition.content });
      }
      return;
    }

    if (addition.type === 'research') {
      blocks.push({ type: 'research', items: addition.items });
    } else if (addition.type === 'error') {
      blocks.push({ type: 'error', message: addition.message });
    }
    return;
  }

  if (addition.kind === 'thinking') {
    const items = researchItems(blocks);
    const last = items.at(-1);
    if (last?.kind === 'thinking') {
      last.text += addition.text;
    } else {
      items.push({ kind: 'thinking', text: addition.text });
    }
    return;
  }

  if (addition.kind === 'tool') {
    researchItems(blocks).push(addition);
    return;
  }

  if (addition.kind === 'tool_result') {
    const items = researchItems(blocks);
    let pendingIndex = -1;
    let fallbackIndex = -1;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item.kind !== 'tool' || item.data.call.tool !== addition.tool) continue;
      if (!item.data.result) {
        pendingIndex = i;
        break;
      }
      if (fallbackIndex === -1) fallbackIndex = i;
    }

    const targetIndex = pendingIndex === -1 ? fallbackIndex : pendingIndex;
    if (targetIndex === -1) {
      items.push({
        kind: 'tool',
        data: { call: { tool: addition.tool, args: {} }, result: { result: addition.result } },
      });
      return;
    }
    const item = items[targetIndex];
    if (item.kind === 'tool') {
      item.data.result = { result: addition.result };
    }
    return;
  }

  const questionsIndex = blocks.findIndex(
    (block) => block.type === 'ask_user_questions' && block.callId === addition.callId,
  );

  if (addition.kind === 'ask_user_questions_requested') {
    const nextBlock: AssistantContentBlock = {
      type: 'ask_user_questions',
      callId: addition.callId,
      questions: addition.questions,
      status: 'pending',
      answers: [],
    };
    if (questionsIndex === -1) {
      blocks.push(nextBlock);
    } else {
      blocks[questionsIndex] = nextBlock;
    }
    return;
  }

  const questionsBlock = blocks[questionsIndex];
  if (questionsBlock?.type !== 'ask_user_questions') return;

  if (addition.kind === 'ask_user_questions_status') {
    questionsBlock.status = addition.status;
    return;
  }

  questionsBlock.status = 'answered';
  questionsBlock.answers = addition.answers;
};

export const setAskUserQuestionsBlockStatus = (
  callId: string,
  status: 'pending' | 'submitting',
) => {
  setMessageTree((state) => {
    for (const message of state.messages) {
      if (message.role !== 'assistant') continue;
      for (const block of message.blocks) {
        if (block.type === 'ask_user_questions' && block.callId === callId) {
          block.status = status;
        }
      }
    }
  });
};

export const getMessageBranchInfo = (messageId: number): BranchInfo | null =>
  getBranchInfo(messageTree.messages, messageId);

export const navigateMessageBranch = (
  messageId: number,
  depth: number,
  direction: 'prev' | 'next',
) => {
  const info = getBranchInfo(messageTree.messages, messageId);
  if (!info) return;

  const nextIndex = direction === 'prev' ? info.currentIndex - 1 : info.currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= info.total) return;
  replaceTree(switchBranch(messageTree, depth, info.siblingIds[nextIndex]));
};

export const setMessageTreeState = (partial: Partial<MessageTreeState>) => {
  setMessageTree((state) => {
    if (partial.messages) state.messages = normalizeMessageParentIds(partial.messages);
    if (partial.currentPath) state.currentPath = partial.currentPath;
    if (partial.latestRootId !== undefined) state.latestRootId = partial.latestRootId;
    if (partial.nextId !== undefined) state.nextId = partial.nextId;
  });
};

export const stampUserMessageTime = (createdAt: string) => {
  setMessageTree((state) => {
    const lastId = state.currentPath.at(-1);
    if (!lastId) return;
    const target = state.messages[lastId - 1];
    if (!target || target.role !== 'user') return;
    target.createdAt = createdAt;
  });
};

export const stampAssistantCompletedAt = (completedAt: string) => {
  setMessageTree((state) => {
    const lastId = state.currentPath.at(-1);
    if (!lastId) return;
    const target = state.messages[lastId - 1];
    if (!target || target.role !== 'assistant') return;
    target.completedAt = completedAt;
  });
};

export const addMessage = (role: Message['role'], blocks: ContentBlock[], createdAt?: string) => {
  const result = addMessageToTree(messageTree, role, blocks, createdAt);
  replaceTree(result);
  return result;
};

export const editMessage = (depth: number, messageId: number, blocks: ContentBlock[]) => {
  const result = editMessageInTree(messageTree, depth, messageId, blocks);
  if (!result) return null;
  replaceTree(result);
  return result;
};

// 服务端落库后回传的权威用户消息，接进本地树。
// 消息自带 parentId/prevSibling/nextSibling，直接按链接拼接；
// id 或链接对不上说明本地树已与服务端发散，立刻抛错。
export const attachConfirmedUserMessage = (message: UserMessage) => {
  const existing = messageTree.messages[message.id - 1];

  if (existing) {
    /* 重连或幂等重试：消息已在树里，用服务端版本覆盖 */
    if (existing.role !== 'user' || existing.parentId !== message.parentId) {
      throw new Error('Local message tree diverged from server');
    }
    const messages = [...messageTree.messages];
    messages[message.id - 1] = message;
    setMessageTreeState({ messages });
    return;
  }

  if (message.id !== messageTree.messages.length + 1) {
    throw new Error('Local message tree diverged from server');
  }

  const messages = [...messageTree.messages];
  const relink = (id: number | null, patch: (node: Message) => void) => {
    if (id === null) return;
    const node = messages[id - 1];
    if (!node) {
      throw new Error('Local message tree diverged from server');
    }
    const copy = { ...node };
    patch(copy);
    messages[id - 1] = copy;
  };
  relink(message.parentId, (node) => {
    node.latestChild = message.id;
  });
  relink(message.prevSibling, (node) => {
    node.nextSibling = message.id;
  });
  relink(message.nextSibling, (node) => {
    node.prevSibling = message.id;
  });
  messages.push(message);

  /* 沿 parentId 走到根，得到新的 currentPath */
  const currentPath: number[] = [];
  let currentId: number | null = message.id;
  while (currentId !== null) {
    const node: Message | undefined = messages[currentId - 1];
    if (!node || currentPath.length > messages.length) {
      throw new Error('Local message tree diverged from server');
    }
    currentPath.unshift(node.id);
    currentId = node.parentId;
  }

  replaceTree({
    messages,
    currentPath,
    latestRootId: currentPath[0] ?? null,
    nextId: messages.length + 1,
  });
};

export const messageTreeActions = {
  addMessage,
  appendToAssistant,
  attachConfirmedUserMessage,
  clear: clearMessageTree,
  editMessage,
  getBranchInfo: getMessageBranchInfo,
  getMessagesFromPath,
  initialize: initializeMessageTree,
  navigateBranch: navigateMessageBranch,
  selectMessage,
  setAskUserQuestionsBlockStatus,
  setMessages,
  setState: setMessageTreeState,
  stampAssistantCompletedAt,
  stampUserMessageTime,
};

export type MessageTreeActions = typeof messageTreeActions;
