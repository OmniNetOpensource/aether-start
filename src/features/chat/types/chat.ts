export type {
  ToolProgress,
  ToolResult,
  Tool,
  ResearchItem,
  AttachmentKind,
  Attachment,
  SerializedAttachment,
  LegacyAttachment,
  UserContentBlock,
  AssistantContentBlock,
  ContentBlock,
  SerializedUserContentBlock,
  SerializedAssistantContentBlock,
  SerializedContentBlock,
  UserMessage,
  AssistantMessage,
  Message,
  SerializedUserMessage,
  SerializedAssistantMessage,
  SerializedMessage,
  MessageLike,
  BranchInfo,
} from '@/features/conversation/model/types/message'

import type { Attachment, UserContentBlock, SerializedMessage } from '@/features/conversation/model/types/message'

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
