import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsBlockStatus,
  AskUserQuestionsQuestion,
} from '@/features/chat/ask-user-questions/ask-user-questions';

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
