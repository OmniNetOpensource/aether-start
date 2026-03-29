import type { Message } from '@/features/chat/message-thread';
import type { ChatServerToClientEvent } from './chat-event-types';
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsQuestion,
} from '@/features/chat/ask-user-questions/ask-user-questions';

export type {
  AskUserQuestionsAnswer,
  AskUserQuestionsBlockStatus,
  AskUserQuestionsOption,
  AskUserQuestionsQuestion,
} from '@/features/chat/ask-user-questions/ask-user-questions';
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

export type PersistedChatEvent = {
  eventId: number;
  event: ChatServerToClientEvent;
  createdAt: number;
};

export type ChatAgentStatus = 'idle' | 'running' | 'completed' | 'aborted' | 'error';
