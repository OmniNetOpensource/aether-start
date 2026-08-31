import { useSyncExternalStore } from 'react';
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
import type {
  AssistantMessage,
  BranchInfo,
  ContentBlock,
  Message,
  UserMessage,
} from '@/shared/chat/message';

export type MessageTreeState = ReturnType<typeof createEmptyMessageState>;

let messageTree = createEmptyMessageState();
let streamingAssistantIdSet: ReadonlySet<number> = new Set<number>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => {
  for (const listener of listeners) listener();
};

export const messages = () => messageTree.messages;
export const currentPath = () => messageTree.currentPath;
export const latestRootId = () => messageTree.latestRootId;
export const nextMessageId = () => messageTree.nextId;
export const getMessageTreeState = () => messageTree;
export const streamingAssistantIds = () => streamingAssistantIdSet;

export const useMessages = () => useSyncExternalStore(subscribe, messages, messages);
export const useCurrentPath = () => useSyncExternalStore(subscribe, currentPath, currentPath);
export const useLatestRootId = () => useSyncExternalStore(subscribe, latestRootId, latestRootId);
export const useNextMessageId = () => useSyncExternalStore(subscribe, nextMessageId, nextMessageId);
export const useMessage = (messageId: number) =>
  useSyncExternalStore(
    subscribe,
    () => messageTree.messages[messageId - 1],
    () => messageTree.messages[messageId - 1],
  );
export const useStreamingAssistantIds = () =>
  useSyncExternalStore(subscribe, streamingAssistantIds, streamingAssistantIds);
export const useIsAssistantStreaming = (messageId: number) =>
  useSyncExternalStore(
    subscribe,
    () => streamingAssistantIdSet.has(messageId),
    () => streamingAssistantIdSet.has(messageId),
  );

const getMessageBranchSignature = (messageId: number) => {
  const info = getBranchInfo(messageTree.messages, messageId);
  return info ? `${info.currentIndex}:${info.siblingIds.join(',')}` : '';
};

export const useMessageBranchInfo = (messageId: number): BranchInfo | null => {
  const branchSignature = useSyncExternalStore(
    subscribe,
    () => getMessageBranchSignature(messageId),
    () => getMessageBranchSignature(messageId),
  );
  return branchSignature ? getBranchInfo(messageTree.messages, messageId) : null;
};

// 所有字段先完整提交，再统一通知订阅者，避免观察到半更新状态。
const replaceTree = (next: MessageTreeState) => {
  if (next === messageTree) return;
  messageTree = next;
  notify();
};

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

const selectMessageInTree = (state: MessageTreeState, messageId: number) => {
  const targetPath: number[] = [];
  const visited = new Set<number>();
  let currentId: number | null = messageId;

  while (currentId !== null) {
    if (visited.has(currentId)) return state;
    const currentMessage: Message | undefined = state.messages[currentId - 1];
    if (!currentMessage) return state;
    targetPath.push(currentId);
    visited.add(currentId);
    currentId = currentMessage.parentId;
  }

  targetPath.reverse();
  let nextState = state;
  for (let index = 0; index < targetPath.length; index += 1) {
    nextState = switchBranch(nextState, index + 1, targetPath[index]);
  }
  return nextState;
};

export const selectMessage = (messageId: number) =>
  replaceTree(selectMessageInTree(messageTree, messageId));

// 正在流式输出的 assistant 消息集合:tree_operation 加入,chat_finished 移除。
// UI 用它判断某条消息是否在生成中(替代全局 status 闸门)。
export const markAssistantStreaming = (assistantMessageId: number) => {
  if (streamingAssistantIdSet.has(assistantMessageId)) return;
  streamingAssistantIdSet = new Set(streamingAssistantIdSet).add(assistantMessageId);
  notify();
};

export const unmarkAssistantStreaming = (assistantMessageId: number) => {
  if (!streamingAssistantIdSet.has(assistantMessageId)) return;
  const next = new Set(streamingAssistantIdSet);
  next.delete(assistantMessageId);
  streamingAssistantIdSet = next;
  notify();
};

export const clearStreamingAssistants = () => {
  if (streamingAssistantIdSet.size === 0) return;
  streamingAssistantIdSet = new Set<number>();
  notify();
};

// 流式热路径只替换目标消息，其他消息与 currentPath 保持引用不变。
export const appendToAssistant = (targetId: number, addition: AssistantAddition) => {
  const target = messageTree.messages[targetId - 1];
  if (!target || target.role !== 'assistant') return;
  if (
    'kind' in addition &&
    (addition.kind === 'ask_user_questions_status' ||
      addition.kind === 'ask_user_questions_answered') &&
    !target.blocks.some(
      (block) => block.type === 'ask_user_questions' && block.callId === addition.callId,
    )
  ) {
    return;
  }

  const blocks = applyAssistantAddition(target.blocks, addition);
  if (blocks === target.blocks) return;

  const nextMessages = [...messageTree.messages];
  nextMessages[targetId - 1] = { ...target, blocks };
  replaceTree({ ...messageTree, messages: nextMessages });
};

export const setAskUserQuestionsBlockStatus = (
  callId: string,
  status: 'pending' | 'submitting',
) => {
  let changed = false;
  const nextMessages = messageTree.messages.map((message) => {
    if (
      message.role !== 'assistant' ||
      !message.blocks.some(
        (block) => block.type === 'ask_user_questions' && block.callId === callId,
      )
    ) {
      return message;
    }

    changed = true;
    return {
      ...message,
      blocks: applyAssistantAddition(message.blocks, {
        kind: 'ask_user_questions_status',
        callId,
        status,
      }),
    };
  });

  if (changed) replaceTree({ ...messageTree, messages: nextMessages });
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
  replaceTree({
    messages:
      partial.messages === undefined
        ? messageTree.messages
        : normalizeMessageParentIds(partial.messages),
    currentPath: partial.currentPath ?? messageTree.currentPath,
    latestRootId:
      partial.latestRootId === undefined ? messageTree.latestRootId : partial.latestRootId,
    nextId: partial.nextId ?? messageTree.nextId,
  });
};

export const stampAssistantCompletedAt = (assistantMessageId: number, completedAt: string) => {
  const target = messageTree.messages[assistantMessageId - 1];
  if (!target || target.role !== 'assistant' || target.completedAt === completedAt) return;

  const nextMessages = [...messageTree.messages];
  nextMessages[assistantMessageId - 1] = { ...target, completedAt };
  replaceTree({ ...messageTree, messages: nextMessages });
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

// tree_operation 事件:服务端树操作的增量结果,客户端只覆盖被改动指针的已有消息。
// 新增的 user 消息与 assistant 占位由发起方的 POST /chat 回执创建(applyChatAccepted)。
// id 对不上说明本地树与服务端发散,立刻抛错。
export const applyTreeOperation = (event: { changedMessages: Message[] }) => {
  const messages = [...messageTree.messages];
  for (const changed of event.changedMessages) {
    if (changed.id > messages.length + 1) {
      throw new Error('Local message tree diverged from server');
    }
    messages[changed.id - 1] = changed;
  }
  replaceTree({ ...messageTree, messages, nextId: messages.length + 1 });
};

// POST /chat 回执:发起方直接放入 user 消息与 assistant 占位容器
export const applyChatAccepted = (userMessage: UserMessage, assistantMessage: AssistantMessage) => {
  const messages = [...messageTree.messages];
  for (const message of [userMessage, assistantMessage]) {
    if (message.id > messages.length + 1) {
      throw new Error('Local message tree diverged from server');
    }
    messages[message.id - 1] = message;
  }
  replaceTree(
    selectMessageInTree(
      {
        messages,
        currentPath: messageTree.currentPath,
        latestRootId: messageTree.latestRootId,
        nextId: messages.length + 1,
      },
      assistantMessage.id,
    ),
  );
};

export const messageTreeActions = {
  addMessage,
  appendToAssistant,
  applyChatAccepted,
  applyTreeOperation,
  clear: clearMessageTree,
  editMessage,
  getBranchInfo: getMessageBranchInfo,
  getMessagesFromPath,
  initialize: initializeMessageTree,
  markAssistantStreaming,
  navigateBranch: navigateMessageBranch,
  selectMessage,
  setAskUserQuestionsBlockStatus,
  setMessages,
  setState: setMessageTreeState,
  stampAssistantCompletedAt,
  unmarkAssistantStreaming,
  clearStreamingAssistants,
};

export type MessageTreeActions = typeof messageTreeActions;
