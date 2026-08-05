import type {
  ChatOperation,
  ChatStartedPayload,
  MessageTreeSnapshot,
} from '@/features/chat/chat-api';
import type { Message, UserMessage } from '@/features/chat/message-thread';
import { cloneMessages } from './block-operations';

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
  changedMessageIds: Set<number>,
): { treeSnapshot: MessageTreeSnapshot; startedPayload: ChatStartedPayload } | null => {
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
    startedPayload: {
      currentPath,
      changedMessages: [...changedMessageIds]
        .sort((left, right) => left - right)
        .map((id) => messages[id - 1])
        .filter((message): message is Message => Boolean(message)),
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
  const changedMessageIds = new Set<number>();

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
        changedMessageIds.add(parent.id);
      }
    }

    return finishOperation(messages, currentMessage.id, changedMessageIds);
  }

  const parent = operation.parentId === null ? null : messages[operation.parentId - 1];
  if (operation.parentId !== null && !parent) {
    return null;
  }

  const previousSibling =
    operation.previousSiblingId === null ? null : messages[operation.previousSiblingId - 1];
  if (
    operation.previousSiblingId !== null &&
    (!previousSibling || previousSibling.parentId !== operation.parentId)
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
    changedMessageIds.add(parent.id);
  }

  if (previousSibling) {
    messages[previousSibling.id - 1] = { ...previousSibling, nextSibling: id };
    changedMessageIds.add(previousSibling.id);
  }

  if (followingSiblingId !== null) {
    const followingSibling = messages[followingSiblingId - 1];
    if (!followingSibling || followingSibling.parentId !== operation.parentId) {
      return null;
    }
    messages[followingSibling.id - 1] = { ...followingSibling, prevSibling: id };
    changedMessageIds.add(followingSibling.id);
  }

  messages.push(currentMessage);
  changedMessageIds.add(id);

  return finishOperation(messages, id, changedMessageIds);
};

export const mergeChatStartedPayload = (
  snapshot: MessageTreeSnapshot,
  payload: ChatStartedPayload,
): MessageTreeSnapshot | null => {
  const messages = cloneMessages(snapshot.messages);

  for (const changedMessage of payload.changedMessages) {
    if (changedMessage.id > messages.length + 1) {
      return null;
    }
    messages[changedMessage.id - 1] = cloneMessages([changedMessage])[0];
  }

  if (
    messages.some((message, index) => !message || message.id !== index + 1) ||
    payload.currentPath.some((id) => !messages[id - 1])
  ) {
    return null;
  }

  return {
    messages,
    currentPath: [...payload.currentPath],
    latestRootId: payload.currentPath[0] ?? null,
    nextId: messages.length + 1,
  };
};
