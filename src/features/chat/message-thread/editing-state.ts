import type { ComposerDocument } from '@/features/chat/composer/composer-editor/composer-document';

export type EditingState = {
  messageId: number;
  editedDocument: ComposerDocument;
};
