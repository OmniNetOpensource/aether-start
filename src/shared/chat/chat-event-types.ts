import type { ChatErrorInfo, Message } from '@/shared/chat/message';

export type ChatServerToClientEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; content: string }
  | {
      type: 'tree_operation';
      assistantMessageId: number;
      changedMessages: Message[];
    }
  | {
      type: 'tool_call';
      tool: string;
      args: Record<string, unknown>;
      callId: string;
    }
  | { type: 'tool_result'; tool: string; result: string; callId: string }
  | {
      type: 'ask_user_questions_requested';
      callId: string;
      questions: AskUserQuestionsQuestion[];
    }
  | {
      type: 'ask_user_questions_answered';
      callId: string;
      answers: AskUserQuestionsAnswer[];
    }
  | { type: 'error'; message: string; error?: ChatErrorInfo }
  | {
      type: 'conversation_created';
      conversationId: string;
      title: string;
      user_id: string;
      created_at: string;
      updated_at: string;
    }
  | {
      type: 'conversation_updated';
      conversationId: string;
      title?: string;
      updated_at: string;
    };
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';
