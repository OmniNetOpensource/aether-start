type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

export type ToolProgress = {
  stage: string;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
};

export type ToolResult = {
  result: string;
};

export type Tool = {
  call: ToolCall;
  progress?: ToolProgress[];
  result?: ToolResult;
};

export type ResearchItem =
  | { kind: "thinking"; text: string }
  | { kind: "tool"; data: Tool };

export type AttachmentKind = "image";

type AttachmentBase = {
  id: string;
  kind: AttachmentKind;
  name: string;
  size: number;
  mimeType: string;
};

export type Attachment = AttachmentBase & {
  displayUrl: string;
};

export type SerializedAttachment = AttachmentBase & {
  url: string;
};

export type LegacyAttachment = SerializedAttachment;

type ResearchBlock = {
  type: "research";
  items: ResearchItem[];
};

export type ContentBlock =
  | { type: "content"; content: string }
  | { type: "attachments"; attachments: Attachment[] }
  | ResearchBlock
  | { type: "error"; message: string };

export type SerializedContentBlock =
  | { type: "content"; content: string }
  | { type: "attachments"; attachments: SerializedAttachment[] }
  | ResearchBlock
  | { type: "error"; message: string };

type MessageBase<Block> = { role: "user" | "assistant"; blocks: Block[] };

export type Message = MessageBase<ContentBlock> & {
  id: number;
  prevSibling: number | null;
  nextSibling: number | null;
  latestChild: number | null;
  createdAt: string;
};

export type SerializedMessage = MessageBase<SerializedContentBlock>;

export type MessageLike =
  | Message
  | SerializedMessage
  | { role: "user" | "assistant"; blocks: ContentBlock[] };

export type BranchInfo = {
  currentIndex: number;
  total: number;
  siblingIds: number[];
};

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
