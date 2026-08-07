import { describe, expect, it } from 'vitest';
import type { ChatOperation } from '@/shared/chat/chat-api';
import { createLinearMessages, editMessage } from './message-tree';
import { appendConfirmedUserMessage, applyChatOperation } from './chat-operation';

const createdAt = '2026-08-05T00:00:00.000Z';

describe('applyChatOperation', () => {
  it('assigns the first message id on the server', () => {
    const result = applyChatOperation(
      [],
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Hello' }] },
        parentId: null,
        previousSiblingId: null,
      },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1]);
    expect(result?.treeSnapshot.nextId).toBe(2);
    expect(result?.treeSnapshot.messages[0]).toMatchObject({
      id: 1,
      parentId: null,
      prevSibling: null,
      role: 'user',
      createdAt,
    });
  });

  it('appends a user message to the selected assistant', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Question' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Answer' }] },
    ]);
    const result = applyChatOperation(
      existing.messages,
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Follow-up' }] },
        parentId: 2,
        previousSiblingId: null,
      },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1, 2, 3]);
    expect(result?.treeSnapshot.messages[1]?.latestChild).toBe(3);
  });

  it('relinks both sides when inserting between existing siblings', () => {
    const original = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Root' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Reply' }] },
      { role: 'user', blocks: [{ type: 'content', content: 'Original' }] },
    ]);
    const alternative = editMessage(original, 3, 3, [{ type: 'content', content: 'Alternative' }]);
    if (!alternative) {
      throw new Error('Expected edit to succeed');
    }

    const result = applyChatOperation(
      alternative.messages,
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Inserted' }] },
        parentId: 2,
        previousSiblingId: 3,
      },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1, 2, 5]);
    expect(result?.treeSnapshot.messages[2]?.nextSibling).toBe(5);
    expect(result?.treeSnapshot.messages[3]?.prevSibling).toBe(5);
    expect(result?.treeSnapshot.messages[4]).toMatchObject({
      id: 5,
      prevSibling: 3,
      nextSibling: 4,
    });
  });

  it('regenerates from an existing user node without creating another user message', () => {
    const original = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Root' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Reply' }] },
      { role: 'user', blocks: [{ type: 'content', content: 'Original' }] },
    ]);
    const alternative = editMessage(original, 3, 3, [{ type: 'content', content: 'Alternative' }]);
    if (!alternative) {
      throw new Error('Expected edit to succeed');
    }

    const result = applyChatOperation(
      alternative.messages,
      { type: 'regenerate', currentMessageId: 3 },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1, 2, 3]);
    expect(result?.treeSnapshot.messages).toHaveLength(4);
    expect(result?.treeSnapshot.messages[1]?.latestChild).toBe(3);
  });

  it('rejects an append without the existing previous sibling', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Root' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Reply' }] },
      { role: 'user', blocks: [{ type: 'content', content: 'Existing child' }] },
    ]);

    expect(
      applyChatOperation(
        existing.messages,
        {
          type: 'append',
          message: { role: 'user', blocks: [{ type: 'content', content: 'Invalid child' }] },
          parentId: 2,
          previousSiblingId: null,
        },
        createdAt,
      ),
    ).toBeNull();
  });
});

describe('appendConfirmedUserMessage', () => {
  it('appends the message returned after the server persisted it', () => {
    const operation: Extract<ChatOperation, { type: 'append' }> = {
      type: 'append',
      message: { role: 'user', blocks: [{ type: 'content', content: 'Hello' }] },
      parentId: null,
      previousSiblingId: null,
    };
    const serverResult = applyChatOperation([], operation, createdAt);
    if (!serverResult || serverResult.treeSnapshot.messages[0]?.role !== 'user') {
      throw new Error('Expected server append to succeed');
    }

    const confirmed = appendConfirmedUserMessage(
      createLinearMessages([]),
      operation,
      serverResult.treeSnapshot.messages[0],
    );

    expect(confirmed).toEqual(serverResult.treeSnapshot);
  });

  it('does not move the current path when reconnecting after the message was already applied', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Question' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Partial answer' }] },
    ]);
    const message = existing.messages[0];
    if (message?.role !== 'user') {
      throw new Error('Expected a user message');
    }

    const confirmed = appendConfirmedUserMessage(
      existing,
      {
        type: 'append',
        message: { role: 'user', blocks: message.blocks },
        parentId: null,
        previousSiblingId: null,
      },
      message,
    );

    expect(confirmed?.currentPath).toEqual([1, 2]);
    expect(confirmed?.messages).toHaveLength(2);
  });
});
