export type {
  ToolProgress,
  ToolResult,
  Tool,
  ResearchItem,
  AttachmentKind,
  Attachment,
  UserContentBlock,
  AssistantContentBlock,
  ContentBlock,
  UserMessage,
  AssistantMessage,
  Message,
  SerializedUserMessage,
  SerializedAssistantMessage,
  SerializedMessage,
  MessageLike,
  BranchInfo,
} from '@/types/message'

import type { Attachment, UserContentBlock, SerializedMessage } from '@/types/message'

export type EditingState = {
  messageId: number;
  originalBlocks: UserContentBlock[];
  editedContent: string;
  editedAttachments: Attachment[];
};

export type SelectedSearchTool =
  | "none"
  | "brave_search"
  | "serp_search"
  | "search";

export type ChatRequest = {
  conversationHistory: SerializedMessage[];
  conversationId?: string | null;
  role?: string;
};
