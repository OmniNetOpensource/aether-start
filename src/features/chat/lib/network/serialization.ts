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

  console.log('\n[2] serializeAttachments - 开始序列化附件:');
  console.log('  附件数量:', attachments.length);

  for (const attachment of attachments) {
    const serializedAttachment = {
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      size: attachment.size,
      mimeType: attachment.mimeType,
      url: attachment.displayUrl,
    };

    console.log('  附件:', attachment.name);
    console.log('    url长度:', serializedAttachment.url.length);
    console.log('    url前100字符:', serializedAttachment.url.substring(0, 100));

    serialized.push(serializedAttachment);
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
