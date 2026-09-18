import { describe, expect, it } from 'vitest';
import { isUserContentBlock, type QuoteItem } from '@/shared/chat/message';
import { quoteForSnapshot } from './share';

const quote: QuoteItem = {
  id: 'quote',
  text: '原文',
  source: {
    conversationId: 'private-conversation',
    messageId: 4,
    ranges: [{ contentIndex: 1, start: 2, end: 4, text: '原文' }],
  },
};

describe('quote sources in shared snapshots', () => {
  it('retains only snapshot-local positions and never exposes a private conversation id', () => {
    const shared = quoteForSnapshot(quote, 'private-conversation', new Set([4]));
    expect(shared.source).toEqual({ ...quote.source, conversationId: null });
    expect(JSON.stringify(shared)).not.toContain('private-conversation');
    expect(quote.source?.conversationId).toBe('private-conversation');
  });

  it('marks missing messages and different conversations unavailable even when ids collide', () => {
    expect(quoteForSnapshot(quote, 'private-conversation', new Set([2])).source).toBeNull();
    expect(quoteForSnapshot(quote, 'another-conversation', new Set([4])).source).toBeNull();
    expect(
      quoteForSnapshot({ id: 'old', text: '原文' }, 'private-conversation', new Set([4])).source,
    ).toBeUndefined();
  });

  it('validates source offsets at the chat request boundary', () => {
    expect(isUserContentBlock({ type: 'quotes', quotes: [quote] })).toBe(true);
    expect(
      isUserContentBlock({
        type: 'quotes',
        quotes: [
          {
            ...quote,
            source: {
              ...quote.source,
              ranges: [{ contentIndex: 0, start: -1, end: 1, text: '原文' }],
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isUserContentBlock({
        type: 'quotes',
        quotes: [{ ...quote, source: { ...quote.source, ranges: [] } }],
      }),
    ).toBe(false);
  });
});
