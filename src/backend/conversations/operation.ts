import type { Operation, MessageTreeSnapshot } from '@/shared/chat/chat-api';
import type { AssistantMessage, Message, UserMessage } from '@/shared/chat/message';
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

export type OperationResult = {
  treeSnapshot: MessageTreeSnapshot;
  /** append 时为新插入的 user 消息;regenerate 时为被重新生成的已有 user 消息(latestChild 已指向新 assistant) */
  userMessage: UserMessage;
  /** 本次操作追加的 assistant 占位消息,该 run 所有流式事件的写入目标 */
  assistantMessage: AssistantMessage;
  /** 除新增消息外,兄弟/父指针被本次操作改动的已有消息 */
  changedMessages: Message[];
};

/**
 * 应用一次树操作并追加 assistant 占位消息。
 * append:插入 user 消息,再在其下挂 assistant 占位;
 * regenerate:在目标 user 消息下新开 assistant 占位分支。
 * 占位前置分配让每个 run 从接受那一刻就有固定写入目标,多 run 并发不会互相串内容。
 */
export const applyOperation = (
  existingMessages: Message[],
  operation: Operation,
  createdAt: string,
): OperationResult | null => {
  if (existingMessages.some((message, index) => message.id !== index + 1)) {
    return null;
  }

  const messages = cloneMessages(existingMessages);
  const changedMessageIds = new Set<number>();

  const appendAssistantPlaceholder = (parentUserId: number): AssistantMessage => {
    const id = messages.length + 1;
    const parent = messages[parentUserId - 1];
    const prevSiblingId = parent.latestChild;
    const assistantMessage: AssistantMessage = {
      id,
      parentId: parentUserId,
      prevSibling: prevSiblingId,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [],
      createdAt,
      completedAt: null,
    };

    if (prevSiblingId !== null) {
      const prevSibling = messages[prevSiblingId - 1];
      messages[prevSiblingId - 1] = { ...prevSibling, nextSibling: id };
      changedMessageIds.add(prevSiblingId);
    }
    messages[parentUserId - 1] = { ...messages[parentUserId - 1], latestChild: id };
    changedMessageIds.add(parentUserId);
    messages.push(assistantMessage);
    return assistantMessage;
  };

  const finishOperation = (
    userMessage: UserMessage,
    assistantMessage: AssistantMessage,
  ): OperationResult | null => {
    const currentPath = buildPathToMessage(messages, assistantMessage.id);
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
      userMessage,
      assistantMessage,
      changedMessages: [...changedMessageIds]
        .filter((id) => id !== userMessage.id && id !== assistantMessage.id)
        .sort((left, right) => left - right)
        .map((id) => messages[id - 1]),
    };
  };

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

    const assistantMessage = appendAssistantPlaceholder(currentMessage.id);
    return finishOperation({ ...currentMessage, latestChild: assistantMessage.id }, assistantMessage);
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
  const userMessage: UserMessage = {
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

  messages.push(userMessage);

  /* 占位追加会把 user 消息的 latestChild 指向 assistant,回传的 userMessage 必须带上这个更新 */
  const assistantMessage = appendAssistantPlaceholder(id);
  return finishOperation({ ...userMessage, latestChild: assistantMessage.id }, assistantMessage);
};
