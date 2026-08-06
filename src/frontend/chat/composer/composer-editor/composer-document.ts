import type { Attachment, QuoteItem, UserContentBlock } from '@/shared/chat/message';

export type PendingAttachment = Attachment & { localUrl?: string };

export type ComposerItem =
  | { type: 'text'; text: string }
  | { type: 'quote'; quote: QuoteItem }
  | { type: 'attachment'; attachment: PendingAttachment };

export type ComposerDocument = ComposerItem[];

export const createComposerDocument = (
  text: string,
  attachments: PendingAttachment[] = [],
): ComposerDocument => {
  const document: ComposerDocument = [];
  if (text) {
    document.push({ type: 'text', text });
  }
  for (const attachment of attachments) {
    document.push({ type: 'attachment', attachment });
  }
  return document;
};

export const composerDocumentFromBlocks = (blocks: UserContentBlock[]): ComposerDocument =>
  blocks.flatMap((block): ComposerDocument => {
    if (block.type === 'content') {
      return [{ type: 'text', text: block.content }];
    }

    if (block.type === 'quotes') {
      return block.quotes.map((quote) => ({ type: 'quote', quote }));
    }

    return block.attachments.map((attachment) => ({ type: 'attachment', attachment }));
  });

export const composerDocumentToBlocks = (document: ComposerDocument): UserContentBlock[] => {
  const blocks: UserContentBlock[] = [];

  for (const item of document) {
    if (item.type === 'text') {
      const content = item.text.trim();
      if (content) {
        blocks.push({ type: 'content', content });
      }
      continue;
    }

    if (item.type === 'quote') {
      blocks.push({ type: 'quotes', quotes: [item.quote] });
      continue;
    }

    blocks.push({
      type: 'attachments',
      attachments: [
        {
          id: item.attachment.id,
          kind: item.attachment.kind,
          name: item.attachment.name,
          size: item.attachment.size,
          mimeType: item.attachment.mimeType,
          url: item.attachment.url,
          storageKey: item.attachment.storageKey,
        },
      ],
    });
  }

  return blocks;
};

export const getComposerText = (document: ComposerDocument) =>
  document.flatMap((item) => (item.type === 'text' ? [item.text] : [])).join('');

export const isComposerDocumentEmpty = (document: ComposerDocument) =>
  document.every((item) => item.type === 'text' && !item.text.trim());

export const isComposerDocumentUploading = (document: ComposerDocument) =>
  document.some((item) => item.type === 'attachment' && !!item.attachment.localUrl);
