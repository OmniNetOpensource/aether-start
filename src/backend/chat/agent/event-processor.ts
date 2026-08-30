import { applyAssistantAddition, cloneMessages } from '@/shared/conversations';
import { buildCurrentPath } from '@/shared/conversations';
import type { AssistantAddition } from '@/shared/conversations/block-operations';
import type { MessageTreeSnapshot, ChatServerToClientEvent } from '@/shared/chat/chat-api';
import type { AssistantMessage, Message } from '@/shared/chat/message';

/** 把增量写进指定的 assistant 消息。目标不存在或角色不符时忽略(事件与树不一致属于服务端 bug)。 */
const appendToAssistant = (
  state: MessageTreeSnapshot,
  assistantMessageId: number,
  addition: AssistantAddition,
): MessageTreeSnapshot => {
  const assistant = state.messages[assistantMessageId - 1];
  if (!assistant || assistant.role !== 'assistant') {
    return state;
  }

  const nextMessages = [...state.messages];
  nextMessages[assistantMessageId - 1] = {
    ...assistant,
    blocks: applyAssistantAddition(assistant.blocks, addition),
  } satisfies AssistantMessage;

  return {
    ...state,
    messages: nextMessages,
  };
};

/**
 * 事件 → 服务端共享树。所有 run 写同一棵树,事件由信封里的 assistantMessageId 定点路由。
 * tree_operation 不在这里处理:服务端侧它就是 applyOperation 的执行本身,
 * 事件只是发给客户端同步的通知。
 */
export const processEventToTree = (
  state: MessageTreeSnapshot,
  event: ChatServerToClientEvent,
  assistantMessageId: number,
): MessageTreeSnapshot => {
  if (event.type === 'content') {
    return appendToAssistant(state, assistantMessageId, {
      type: 'content',
      content: event.content,
    });
  }

  if (event.type === 'thinking') {
    return appendToAssistant(state, assistantMessageId, {
      kind: 'thinking',
      text: event.content,
    });
  }

  if (event.type === 'tool_call') {
    return appendToAssistant(state, assistantMessageId, {
      kind: 'tool',
      data: {
        call: { tool: event.tool, args: event.args },
      },
    });
  }

  if (event.type === 'tool_result') {
    return appendToAssistant(state, assistantMessageId, {
      kind: 'tool_result',
      tool: event.tool,
      result: event.result,
    });
  }

  if (event.type === 'error') {
    return appendToAssistant(state, assistantMessageId, {
      type: 'error',
      message: event.message,
      error: event.error,
    });
  }

  if (event.type === 'ask_user_questions_requested') {
    return appendToAssistant(state, assistantMessageId, {
      kind: 'ask_user_questions_requested',
      callId: event.callId,
      questions: event.questions,
    });
  }

  if (event.type === 'ask_user_questions_answered') {
    return appendToAssistant(state, assistantMessageId, {
      kind: 'ask_user_questions_answered',
      callId: event.callId,
      answers: event.answers,
    });
  }

  return state;
};

export const cloneTreeSnapshot = (snapshot: MessageTreeSnapshot): MessageTreeSnapshot => {
  const clonedMessages = cloneMessages(snapshot.messages as Message[]);
  const latestRootId =
    typeof snapshot.latestRootId === 'number'
      ? snapshot.latestRootId
      : (clonedMessages[0]?.id ?? null);
  const currentPath =
    Array.isArray(snapshot.currentPath) &&
    snapshot.currentPath.every((id) => typeof id === 'number')
      ? [...snapshot.currentPath]
      : buildCurrentPath(clonedMessages, latestRootId);
  const nextId =
    typeof snapshot.nextId === 'number'
      ? snapshot.nextId
      : clonedMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1;

  return {
    messages: clonedMessages,
    currentPath,
    latestRootId,
    nextId,
  };
};
