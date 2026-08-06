import { createSignal } from 'solid-js';
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
import {
  applyAssistantAddition,
  type AssistantAddition,
} from '@/shared/conversations/block-operations';
import type { BranchInfo, ContentBlock, Message } from '@/shared/chat/message';

export type MessageTreeState = ReturnType<typeof createEmptyMessageState>;

const [messageTree, setMessageTree] = createSignal<MessageTreeState>(createEmptyMessageState());

export const messages = () => messageTree().messages;
export const currentPath = () => messageTree().currentPath;
export const latestRootId = () => messageTree().latestRootId;
export const nextMessageId = () => messageTree().nextId;
export const getMessageTreeState = messageTree;

export const clearMessageTree = () => setMessageTree(createEmptyMessageState());

export const setMessages = (nextMessages: Message[]) => {
  const linearState = createLinearMessages(
    nextMessages.map((message) => ({
      role: message.role,
      blocks: message.blocks ?? [],
      createdAt: message.createdAt,
    })),
  );
  setMessageTree(linearState);
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

  setMessageTree({
    messages: normalizedMessages,
    currentPath: resolvedPath,
    latestRootId: resolvedPath[0] ?? fallbackRootId,
    nextId: normalizedMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1,
  });
};

export const getMessagesFromPath = () =>
  computeMessagesFromPath(messageTree().messages, messageTree().currentPath);

export const selectMessage = (messageId: number) => {
  const state = messageTree();
  const targetPath: number[] = [];
  const visited = new Set<number>();
  let currentId: number | null = messageId;

  while (currentId !== null) {
    if (visited.has(currentId)) return;
    const currentMessage: Message | undefined = state.messages[currentId - 1];
    if (!currentMessage) return;
    targetPath.push(currentId);
    visited.add(currentId);
    currentId = currentMessage.parentId;
  }

  targetPath.reverse();
  let nextState = state;
  for (let index = 0; index < targetPath.length; index += 1) {
    nextState = switchBranch(nextState, index + 1, targetPath[index]);
  }
  setMessageTree(nextState);
};

export const appendToAssistant = (addition: AssistantAddition) => {
  setMessageTree((state) => {
    const lastId = state.currentPath.at(-1) ?? null;
    const lastMessage = lastId ? state.messages[lastId - 1] : null;
    let nextState = state;
    let assistantId = lastId;

    if (!lastMessage || lastMessage.role !== 'assistant') {
      const result = addMessageToTree(state, 'assistant', []);
      nextState = result;
      assistantId = result.addedMessage.id;
    }

    if (!assistantId) return state;
    const targetMessage = nextState.messages[assistantId - 1];
    if (!targetMessage || targetMessage.role !== 'assistant') return state;

    const updatedMessages = [...nextState.messages];
    updatedMessages[assistantId - 1] = {
      ...targetMessage,
      blocks: applyAssistantAddition(targetMessage.blocks ?? [], addition),
    };
    return { ...nextState, messages: updatedMessages };
  });
};

export const setAskUserQuestionsBlockStatus = (
  callId: string,
  status: 'pending' | 'submitting',
) => {
  setMessageTree((state) => ({
    ...state,
    messages: state.messages.map((message) => {
      if (message.role !== 'assistant') return message;
      const blocks = applyAssistantAddition(message.blocks, {
        kind: 'ask_user_questions_status',
        callId,
        status,
      });
      return blocks === message.blocks ? message : { ...message, blocks };
    }),
  }));
};

export const getMessageBranchInfo = (messageId: number): BranchInfo | null =>
  getBranchInfo(messageTree().messages, messageId);

export const navigateMessageBranch = (
  messageId: number,
  depth: number,
  direction: 'prev' | 'next',
) => {
  const state = messageTree();
  const info = getBranchInfo(state.messages, messageId);
  if (!info) return;

  const nextIndex = direction === 'prev' ? info.currentIndex - 1 : info.currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= info.total) return;
  setMessageTree(switchBranch(state, depth, info.siblingIds[nextIndex]));
};

export const setMessageTreeState = (partial: Partial<MessageTreeState>) => {
  setMessageTree((state) => ({
    messages: partial.messages ? normalizeMessageParentIds(partial.messages) : state.messages,
    currentPath: partial.currentPath ?? state.currentPath,
    latestRootId: partial.latestRootId ?? state.latestRootId,
    nextId: partial.nextId ?? state.nextId,
  }));
};

export const stampUserMessageTime = (createdAt: string) => {
  setMessageTree((state) => {
    const lastId = state.currentPath.at(-1);
    if (!lastId) return state;
    const target = state.messages[lastId - 1];
    if (!target || target.role !== 'user') return state;
    const nextMessages = [...state.messages];
    nextMessages[lastId - 1] = { ...target, createdAt };
    return { ...state, messages: nextMessages };
  });
};

export const stampAssistantCompletedAt = (completedAt: string) => {
  setMessageTree((state) => {
    const lastId = state.currentPath.at(-1);
    if (!lastId) return state;
    const target = state.messages[lastId - 1];
    if (!target || target.role !== 'assistant') return state;
    const nextMessages = [...state.messages];
    nextMessages[lastId - 1] = { ...target, completedAt };
    return { ...state, messages: nextMessages };
  });
};

export const addMessage = (role: Message['role'], blocks: ContentBlock[], createdAt?: string) => {
  const result = addMessageToTree(messageTree(), role, blocks, createdAt);
  setMessageTree(result);
  return result;
};

export const editMessage = (depth: number, messageId: number, blocks: ContentBlock[]) => {
  const result = editMessageInTree(messageTree(), depth, messageId, blocks);
  if (!result) return null;
  setMessageTree(result);
  return result;
};

export const messageTreeActions = {
  addMessage,
  appendToAssistant,
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
