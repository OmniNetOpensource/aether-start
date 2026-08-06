import { describe, expect, it } from 'vitest';
import {
  composerDocumentFromBlocks,
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from './composer-document';

describe('composer document', () => {
  it('preserves text, quote and image order when converting message blocks', () => {
    const document = composerDocumentFromBlocks([
      { type: 'content', content: 'before' },
      { type: 'quotes', quotes: [{ id: 'quote-1', text: 'source' }] },
      {
        type: 'attachments',
        attachments: [
          {
            id: 'image-1',
            kind: 'image',
            name: 'chart.png',
            size: 10,
            mimeType: 'image/png',
            url: '/api/assets/chart',
            storageKey: 'chart',
          },
        ],
      },
      { type: 'content', content: 'after' },
    ]);

    expect(composerDocumentToBlocks(document)).toEqual([
      { type: 'content', content: 'before' },
      { type: 'quotes', quotes: [{ id: 'quote-1', text: 'source' }] },
      {
        type: 'attachments',
        attachments: [
          {
            id: 'image-1',
            kind: 'image',
            name: 'chart.png',
            size: 10,
            mimeType: 'image/png',
            url: '/api/assets/chart',
            storageKey: 'chart',
          },
        ],
      },
      { type: 'content', content: 'after' },
    ]);
  });

  it('detects empty and uploading documents without sending local image urls', () => {
    const document: ComposerDocument = [
      { type: 'text', text: '  ' },
      {
        type: 'attachment',
        attachment: {
          id: 'image-1',
          kind: 'image',
          name: 'chart.png',
          size: 10,
          mimeType: 'image/png',
          url: '',
          localUrl: 'blob:preview',
        },
      },
    ];

    expect(isComposerDocumentEmpty([{ type: 'text', text: '\n  ' }])).toBe(true);
    expect(isComposerDocumentEmpty(document)).toBe(false);
    expect(isComposerDocumentUploading(document)).toBe(true);
    expect(composerDocumentToBlocks(document)).toEqual([
      {
        type: 'attachments',
        attachments: [
          {
            id: 'image-1',
            kind: 'image',
            name: 'chart.png',
            size: 10,
            mimeType: 'image/png',
            url: '',
            storageKey: undefined,
          },
        ],
      },
    ]);
  });
});
