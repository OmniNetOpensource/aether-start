import type { Message, UserContentBlock, UserMessage } from '@/shared/chat/message';
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

export type ChatOperation =
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

export type MessageTreeUpdatePayload = {
  currentPath: number[];
  changedMessages: Message[];
};

export type ChatCommandResponse =
  | {
      type: 'append';
      conversationId: string;
      message: UserMessage;
    }
  | {
      type: 'regenerate';
      conversationId: string;
    };

export type PersistedChatEvent = {
  eventId: number;
  event: ChatServerToClientEvent;
  createdAt: number;
};

export type ChatAgentStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error';
