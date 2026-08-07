import type {
  AssistantMessage,
  Message,
  UserContentBlock,
  UserMessage,
} from '@/shared/chat/message';
import type { ChatServerToClientEvent } from './chat-event-types';
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';

export type {
  AskUserQuestionsAnswer,
  AskUserQuestionsBlockStatus,
  AskUserQuestionsOption,
  AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';
export type {
  ArtifactLanguage,
  ChatErrorCode,
  ChatErrorInfo,
  ChatErrorProvider,
  ChatServerToClientEvent,
} from './chat-event-types';

// Tool call pending execution
export type PendingToolInvocation = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

// Result from tool execution
export type ToolInvocationResult = {
  id: string;
  name: string;
  result: string;
};

export type AskUserQuestionsRequestEvent = {
  type: 'ask_user_questions_requested';
  callId: string;
  questions: AskUserQuestionsQuestion[];
};

export type AskUserQuestionsAnsweredEvent = {
  type: 'ask_user_questions_answered';
  callId: string;
  answers: AskUserQuestionsAnswer[];
};

export type MessageTreeSnapshot = {
  messages: Message[];
  currentPath: number[];
  latestRootId: number | null;
  nextId: number;
};

export type Operation =
  | {
      type: 'append';
      message: {
        role: 'user';
        blocks: UserContentBlock[];
      };
      parentId: number | null;
      previousSiblingId: number | null;
    }
  | {
      type: 'regenerate';
      currentMessageId: number;
    };

/** POST /chat 的回执:发起方据此直接创建 user 消息与 assistant 占位容器。 */
export type ChatCommandResponse = {
  conversationId: string;
  /** append 时为新插入的 user 消息;regenerate 时为被重新生成的已有 user 消息(latestChild 已指向新 assistant) */
  userMessage: UserMessage;
  assistantMessage: AssistantMessage;
};

export type ChatFinishedPayload = {
  assistantMessageId: number;
  status: 'completed' | 'aborted' | 'error';
  assistantCompletedAt: string | null;
  remainingRuns: number;
};

export type PersistedChatEvent = {
  eventId: number;
  event: ChatServerToClientEvent;
  /** 内容类事件的写入目标;tree_operation / conversation_updated 等全局事件为 null */
  assistantMessageId: number | null;
  createdAt: number;
};

export type ChatAgentStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error';
