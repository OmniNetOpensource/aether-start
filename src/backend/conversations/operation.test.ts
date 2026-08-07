import { describe, expect, it } from 'vitest';
import { createLinearMessages, editMessage } from '@/shared/conversations/message-tree';
import { applyOperation } from './operation';

const createdAt = '2026-08-05T00:00:00.000Z';

describe('applyOperation', () => {
  it('assigns the first message id and appends an assistant placeholder', () => {
    const result = applyOperation(
      [],
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Hello' }] },
        parentId: null,
        previousSiblingId: null,
      },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1, 2]);
    expect(result?.treeSnapshot.nextId).toBe(3);
    expect(result?.userMessage).toMatchObject({
      id: 1,
      parentId: null,
      prevSibling: null,
      latestChild: 2,
      role: 'user',
      createdAt,
    });
    expect(result?.assistantMessage).toMatchObject({
      id: 2,
      parentId: 1,
      role: 'assistant',
      blocks: [],
      completedAt: null,
    });
    expect(result?.changedMessages).toEqual([]);
  });

  it('appends a user message and placeholder to the selected assistant', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Question' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Answer' }] },
    ]);
    const result = applyOperation(
      existing.messages,
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Follow-up' }] },
        parentId: 2,
        previousSiblingId: null,
      },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1, 2, 3, 4]);
    expect(result?.treeSnapshot.messages[1]?.latestChild).toBe(3);
    expect(result?.assistantMessage.id).toBe(4);
    expect(result?.treeSnapshot.messages[2]?.latestChild).toBe(4);
    expect(result?.userMessage?.latestChild).toBe(4);
    /* user 3 与 assistant 4 都是新增,changedMessages 只含被改指针的 assistant 2 */
    expect(result?.changedMessages.map((message) => message.id)).toEqual([2]);
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

    const result = applyOperation(
      alternative.messages,
      {
        type: 'append',
        message: { role: 'user', blocks: [{ type: 'content', content: 'Inserted' }] },
        parentId: 2,
        previousSiblingId: 3,
      },
      createdAt,
    );

    expect(result?.treeSnapshot.currentPath).toEqual([1, 2, 5, 6]);
    expect(result?.treeSnapshot.messages[2]?.nextSibling).toBe(5);
    expect(result?.treeSnapshot.messages[3]?.prevSibling).toBe(5);
    expect(result?.treeSnapshot.messages[4]).toMatchObject({
      id: 5,
      prevSibling: 3,
      nextSibling: 4,
    });
    expect(result?.assistantMessage).toMatchObject({ id: 6, parentId: 5 });
    expect(result?.changedMessages.map((message) => message.id)).toEqual([2, 3, 4]);
  });

  it('regenerates by adding a sibling assistant placeholder under the user node', () => {
    const original = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Root' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Reply' }] },
      { role: 'user', blocks: [{ type: 'content', content: 'Original' }] },
    ]);
    const alternative = editMessage(original, 3, 3, [{ type: 'content', content: 'Alternative' }]);
    if (!alternative) {
      throw new Error('Expected edit to succeed');
    }

    const result = applyOperation(
      alternative.messages,
      { type: 'regenerate', currentMessageId: 3 },
      createdAt,
    );

    expect(result?.userMessage).toMatchObject({ id: 3, role: 'user', latestChild: 5 });
    expect(result?.assistantMessage).toMatchObject({ id: 5, parentId: 3 });
    expect(result?.treeSnapshot.currentPath).toEqual([1, 2, 3, 5]);
    expect(result?.treeSnapshot.messages).toHaveLength(5);
    expect(result?.treeSnapshot.messages[1]?.latestChild).toBe(3);
    expect(result?.treeSnapshot.messages[2]?.latestChild).toBe(5);
  });

  it('keeps sibling links between assistant placeholders across two regenerates', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Question' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Answer' }] },
    ]);

    const first = applyOperation(
      existing.messages,
      { type: 'regenerate', currentMessageId: 1 },
      createdAt,
    );
    expect(first?.assistantMessage).toMatchObject({ id: 3, prevSibling: 2 });

    const second = applyOperation(
      first!.treeSnapshot.messages,
      { type: 'regenerate', currentMessageId: 1 },
      createdAt,
    );
    expect(second?.assistantMessage).toMatchObject({ id: 4, prevSibling: 3 });
    expect(second?.treeSnapshot.messages[2]?.nextSibling).toBe(4);
    expect(second?.userMessage).toMatchObject({ id: 1, latestChild: 4 });
    /* user 1 作为 userMessage 回传,不再进 changedMessages */
    expect(second?.changedMessages.map((message) => message.id)).toEqual([3]);
  });

  it('rejects an append without the existing previous sibling', () => {
    const existing = createLinearMessages([
      { role: 'user', blocks: [{ type: 'content', content: 'Root' }] },
      { role: 'assistant', blocks: [{ type: 'content', content: 'Reply' }] },
      { role: 'user', blocks: [{ type: 'content', content: 'Existing child' }] },
    ]);

    expect(
      applyOperation(
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
