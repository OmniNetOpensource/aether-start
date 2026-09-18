import { describe, expect, it, vi } from 'vitest';
import { isMessage, type Message, type QuoteItem } from '@/shared/chat/message';
import { branchConversation } from './conversations-db';
import { getPublicShareByToken } from '@/backend/share/conversation-shares-db';

function databaseReturning(row: Record<string, unknown>) {
  const unexpected = () => {
    throw new Error('Unexpected database operation');
  };
  const statement = {
    bind: vi.fn<D1PreparedStatement['bind']>(),
    first: vi.fn<D1PreparedStatement['first']>().mockResolvedValue(row),
    run: unexpected,
    all: unexpected,
    raw: unexpected,
  };
  statement.bind.mockReturnValue(statement);
  const db = {
    prepare: vi.fn<D1Database['prepare']>().mockReturnValue(statement),
    batch: async () => [],
    exec: vi.fn<D1Database['exec']>(),
    withSession: vi.fn<D1Database['withSession']>(),
    dump: vi.fn<D1Database['dump']>(),
  };
  return { db, statement };
}

const quote: QuoteItem = {
  id: 'quote',
  text: '原文',
  source: {
    conversationId: 'original',
    messageId: 3,
    ranges: [{ contentIndex: 0, start: 0, end: 2, text: '原文' }],
  },
};

describe('persisted quote positions', () => {
  it('remaps source ids when copying a branch, without changing the original conversation', async () => {
    const messages: Message[] = [
      {
        id: 1,
        role: 'user',
        parentId: null,
        latestChild: 3,
        blocks: [{ type: 'content', content: '问题' }],
        prevSibling: null,
        nextSibling: null,
        createdAt: '',
        completedAt: null,
      },
      {
        id: 2,
        role: 'assistant',
        parentId: 1,
        latestChild: null,
        blocks: [{ type: 'content', content: '其他分支' }],
        prevSibling: null,
        nextSibling: 3,
        createdAt: '',
        completedAt: null,
      },
      {
        id: 3,
        role: 'assistant',
        parentId: 1,
        latestChild: 4,
        blocks: [{ type: 'content', content: '原文' }],
        prevSibling: 2,
        nextSibling: null,
        createdAt: '',
        completedAt: null,
      },
      {
        id: 4,
        role: 'user',
        parentId: 3,
        latestChild: null,
        blocks: [{ type: 'quotes', quotes: [quote, { id: 'old', text: '旧引用' }] }],
        prevSibling: null,
        nextSibling: null,
        createdAt: '',
        completedAt: null,
      },
    ];
    const { db, statement } = databaseReturning({
      messages_json: JSON.stringify(messages),
      title: 'test',
      model: null,
    });
    const result = await branchConversation(db, { userId: 'user', id: 'original', messageId: 4 });
    const serialized = statement.bind.mock.calls.find(
      (args) => args.length === 3 && typeof args[2] === 'string' && args[2].startsWith('['),
    )?.[2];
    if (typeof serialized !== 'string') throw new Error('No persisted message body');
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) throw new Error('Not a message list');
    const copied = parsed.filter(isMessage);
    expect(copied.map((message) => message.id)).toEqual([1, 2, 3]);
    expect(copied[2].blocks).toEqual([
      {
        type: 'quotes',
        quotes: [
          {
            ...quote,
            source: { ...quote.source, conversationId: result.conversationId, messageId: 2 },
          },
          { id: 'old', text: '旧引用' },
        ],
      },
    ]);
    expect(quote.source?.conversationId).toBe('original');
    expect(quote.source?.messageId).toBe(3);
  });

  it('retains snapshot-local quote metadata when reading a stored share', async () => {
    const shared = { ...quote, source: { ...quote.source, conversationId: null } };
    const { db } = databaseReturning({
      user_id: 'user',
      conversation_id: 'original',
      share_token: 's_test',
      is_active: true,
      snapshot_json: JSON.stringify({
        version: 1,
        messages: [
          {
            id: 4,
            role: 'user',
            createdAt: '',
            completedAt: null,
            blocks: [{ type: 'quotes', quotes: [shared] }],
          },
        ],
      }),
    });
    const result = await getPublicShareByToken(db, 's_test');
    if (result.status !== 'active') throw new Error('Missing share');
    expect(result.snapshotRaw.messages[0].blocks).toEqual([{ type: 'quotes', quotes: [shared] }]);
  });
});
