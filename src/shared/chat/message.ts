import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsBlockStatus,
  AskUserQuestionsQuestion,
} from '@/shared/chat/ask-user-questions';

type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

export type ToolResult = {
  result: string;
};

export type Tool = {
  call: ToolCall;
  result?: ToolResult;
};

export type ResearchItem = { kind: 'thinking'; text: string } | { kind: 'tool'; data: Tool };

export type AttachmentKind = 'image';

type AttachmentBase = {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: number;
  mimeType: string;
};

export type Attachment = AttachmentBase & {
  url: string;
  storageKey?: string;
};

type ResearchBlock = {
  type: 'research';
  items: ResearchItem[];
};

type AskUserQuestionsBlock = {
  type: 'ask_user_questions';
  callId: string;
  questions: AskUserQuestionsQuestion[];
  status: AskUserQuestionsBlockStatus;
  answers: AskUserQuestionsAnswer[];
};

// --- Role-specific block types ---

export type QuoteItem = { id: string; text: string };

export type UserContentBlock =
  | { type: 'content'; content: string }
  | { type: 'quotes'; quotes: QuoteItem[] }
  | { type: 'attachments'; attachments: Attachment[] };

export type AssistantContentBlock =
  | { type: 'content'; content: string }
  | ResearchBlock
  | AskUserQuestionsBlock
  | { type: 'error'; message: string };

export type ContentBlock = UserContentBlock | AssistantContentBlock;

// --- Message types (discriminated union on role) ---

type MessageFields = {
  id: number;
  parentId: number | null;
  prevSibling: number | null;
  nextSibling: number | null;
  latestChild: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type UserMessage = MessageFields & {
  role: 'user';
  blocks: UserContentBlock[];
};

export type AssistantMessage = MessageFields & {
  role: 'assistant';
  blocks: AssistantContentBlock[];
};

export type Message = UserMessage | AssistantMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMessageId = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);

export const isUserContentBlock = (value: unknown): value is UserContentBlock => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'content') {
    return typeof value.content === 'string';
  }

  if (value.type === 'quotes') {
    return (
      Array.isArray(value.quotes) &&
      value.quotes.every(
        (quote) =>
          isRecord(quote) && typeof quote.id === 'string' && typeof quote.text === 'string',
      )
    );
  }

  if (value.type === 'attachments') {
    return (
      Array.isArray(value.attachments) &&
      value.attachments.every(
        (attachment) =>
          isRecord(attachment) &&
          typeof attachment.id === 'string' &&
          attachment.kind === 'image' &&
          typeof attachment.name === 'string' &&
          typeof attachment.size === 'number' &&
          typeof attachment.mimeType === 'string' &&
          typeof attachment.url === 'string' &&
          (attachment.storageKey === undefined || typeof attachment.storageKey === 'string'),
      )
    );
  }

  return false;
};

export const isMessage = (value: unknown): value is Message =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  Number.isInteger(value.id) &&
  value.id > 0 &&
  isMessageId(value.parentId) &&
  isMessageId(value.prevSibling) &&
  isMessageId(value.nextSibling) &&
  isMessageId(value.latestChild) &&
  (value.role === 'user' || value.role === 'assistant') &&
  Array.isArray(value.blocks) &&
  typeof value.createdAt === 'string' &&
  (typeof value.completedAt === 'string' || value.completedAt === null);

// --- Serialized message types ---

export type SerializedUserMessage = {
  role: 'user';
  blocks: UserContentBlock[];
};

export type SerializedAssistantMessage = {
  role: 'assistant';
  blocks: AssistantContentBlock[];
};

export type SerializedMessage = SerializedUserMessage | SerializedAssistantMessage;

export type MessageLike =
  | Message
  | SerializedMessage
  | { role: 'user' | 'assistant'; blocks: ContentBlock[] };

export type BranchInfo = {
  currentIndex: number;
  total: number;
  siblingIds: number[];
};
