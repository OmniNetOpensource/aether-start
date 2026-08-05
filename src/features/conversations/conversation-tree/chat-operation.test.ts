import { describe, expect, it } from 'vitest';
import { createLinearMessages, editMessage } from './message-tree';
import { applyChatOperation, mergeChatStartedPayload } from './chat-operation';

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
    expect(result?.startedPayload.changedMessages.map((message) => message.id)).toEqual([2, 3]);
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
    expect(result?.startedPayload.changedMessages.map((message) => message.id)).toEqual([
      2, 3, 4, 5,
    ]);
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
    expect(result?.startedPayload.changedMessages.map((message) => message.id)).toEqual([2]);
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

describe('mergeChatStartedPayload', () => {
  it('merges server-assigned messages into the client tree', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Question' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Answer' }] },
    ]);
    const operationResult = applyChatOperation(
      existing.messages,
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Follow-up' }] },
        parentId: 2,
        previousSiblingId: null,
      },
      createdAt,
    );
    if (!operationResult) {
      throw new Error('Expected append to succeed');
    }

    const merged = mergeChatStartedPayload(existing, operationResult.startedPayload);

    expect(merged).toEqual(operationResult.treeSnapshot);
  });
});
