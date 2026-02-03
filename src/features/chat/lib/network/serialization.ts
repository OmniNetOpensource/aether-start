import type {
  Attachment,
  ContentBlock,
  Message,
  SerializedAttachment,
  SerializedContentBlock,
  SerializedMessage,
} from "@/src/features/chat/types/chat";

const serializeAttachments = async (
  attachments: Attachment[]
): Promise<SerializedAttachment[]> => {
  const serialized: SerializedAttachment[] = [];

  for (const attachment of attachments) {
    serialized.push({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      size: attachment.size,
      mimeType: attachment.mimeType,
      url: attachment.displayUrl,
    });
  }

  return serialized;
};

const serializeBlocks = async (
  blocks: ContentBlock[]
): Promise<SerializedContentBlock[]> =>
  Promise.all(
    blocks.map(async (block) => {
      if (block.type === "attachments") {
        return {
          ...block,
          attachments: await serializeAttachments(block.attachments),
        };
      }
      return { ...block };
    })
  );

export const serializeMessagesForRequest = async (
  messages: Message[]
): Promise<SerializedMessage[]> =>
  Promise.all(
    messages.map(async (message) => ({
      role: message.role,
      blocks: await serializeBlocks(message.blocks),
    }))
  );
