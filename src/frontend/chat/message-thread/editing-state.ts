import type { ComposerDocument } from '@/frontend/chat/composer/composer-editor/composer-document';

export type EditingState = {
  messageId: number;
  editedDocument: ComposerDocument;
};
