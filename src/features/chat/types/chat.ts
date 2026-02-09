export type {
  ToolProgress,
  ToolResult,
  Tool,
  ResearchItem,
  AttachmentKind,
  Attachment,
  SerializedAttachment,
  LegacyAttachment,
  ContentBlock,
  SerializedContentBlock,
  Message,
  SerializedMessage,
  MessageLike,
  BranchInfo,
} from '@/features/conversation/types/message'

import type { Attachment, ContentBlock, SerializedMessage } from '@/features/conversation/types/message'

export type EditingState = {
  messageId: number;
  originalBlocks: ContentBlock[];
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
