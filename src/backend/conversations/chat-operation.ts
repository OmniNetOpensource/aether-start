import type { ChatOperation, MessageTreeSnapshot } from '@/shared/chat/chat-api';
import type { Message, UserMessage } from '@/shared/chat/message';
import { cloneMessages } from '@/shared/conversations';

const buildPathToMessage = (messages: Message[], messageId: number) => {
  const path: number[] = [];
  const visited = new Set<number>();
  let currentId: number | null = messageId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return null;
    }

    const message: Message | undefined = messages[currentId - 1];
    if (!message || message.id !== currentId) {
      return null;
    }

    path.unshift(currentId);
    visited.add(currentId);
    currentId = message.parentId;
  }

  return path;
};

const finishOperation = (
  messages: Message[],
  currentMessageId: number,
): { treeSnapshot: MessageTreeSnapshot } | null => {
  const currentPath = buildPathToMessage(messages, currentMessageId);
  if (!currentPath) {
    return null;
  }

  return {
    treeSnapshot: {
      messages,
      currentPath,
      latestRootId: currentPath[0] ?? null,
      nextId: messages.length + 1,
    },
  };
};

export const applyChatOperation = (
  existingMessages: Message[],
  operation: ChatOperation,
  createdAt: string,
) => {
  if (existingMessages.some((message, index) => message.id !== index + 1)) {
    return null;
  }

  const messages = cloneMessages(existingMessages);

  if (operation.type === 'regenerate') {
    const currentMessage = messages[operation.currentMessageId - 1];
    if (!currentMessage || currentMessage.role !== 'user') {
      return null;
    }

    if (currentMessage.parentId !== null) {
      const parent = messages[currentMessage.parentId - 1];
      if (!parent) {
        return null;
      }
      if (parent.latestChild !== currentMessage.id) {
        messages[parent.id - 1] = { ...parent, latestChild: currentMessage.id };
      }
    }

    return finishOperation(messages, currentMessage.id);
  }

  const parent = operation.parentId === null ? null : messages[operation.parentId - 1];
  if (operation.parentId !== null && (!parent || parent.role !== 'assistant')) {
    return null;
  }

  const previousSibling =
    operation.previousSiblingId === null ? null : messages[operation.previousSiblingId - 1];
  if (
    operation.previousSiblingId !== null &&
    (!previousSibling ||
      previousSibling.role !== 'user' ||
      previousSibling.parentId !== operation.parentId)
  ) {
    return null;
  }

  if (
    !previousSibling &&
    ((parent && parent.latestChild !== null) ||
      (!parent && messages.some((item) => item.parentId === null)))
  ) {
    return null;
  }

  const id = messages.length + 1;
  const followingSiblingId = previousSibling?.nextSibling ?? null;
  const currentMessage: UserMessage = {
    id,
    parentId: operation.parentId,
    prevSibling: operation.previousSiblingId,
    nextSibling: followingSiblingId,
    latestChild: null,
    role: 'user',
    blocks: operation.message.blocks,
    createdAt,
    completedAt: null,
  };

  if (parent) {
    messages[parent.id - 1] = { ...parent, latestChild: id };
  }

  if (previousSibling) {
    messages[previousSibling.id - 1] = { ...previousSibling, nextSibling: id };
  }

  if (followingSiblingId !== null) {
    const followingSibling = messages[followingSiblingId - 1];
    if (!followingSibling || followingSibling.parentId !== operation.parentId) {
      return null;
    }
    messages[followingSibling.id - 1] = { ...followingSibling, prevSibling: id };
  }

  messages.push(currentMessage);

  return finishOperation(messages, id);
};
