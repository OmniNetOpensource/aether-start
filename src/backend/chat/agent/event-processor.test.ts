import { describe, expect, it } from 'vitest';
import { applyOperation } from '@/backend/conversations/operation';
import { processEventToTree } from './event-processor';

const createdAt = '2026-08-07T00:00:00.000Z';

const setupTwoRuns = () => {
  /* run A: 首条消息 → user 1 + assistant 2 */
  const first = applyOperation(
    [],
    {
      type: 'append',
      message: { role: 'user', blocks: [{ type: 'content', content: 'Rust?' }] },
      parentId: null,
      previousSiblingId: null,
    },
    createdAt,
  );
  if (!first) throw new Error('first operation failed');

  /* run B: 编辑同一条 user → user 3 + assistant 4(兄弟分支) */
  const second = applyOperation(
    first.treeSnapshot.messages,
    {
      type: 'append',
      message: { role: 'user', blocks: [{ type: 'content', content: 'Go?' }] },
      parentId: null,
      previousSiblingId: 1,
    },
    createdAt,
  );
  if (!second) throw new Error('second operation failed');

  return second.treeSnapshot;
};

describe('processEventToTree', () => {
  it('routes concurrent content events to their own assistant targets', () => {
    let tree = setupTwoRuns();

    /* 两条流交错到达 */
    tree = processEventToTree(tree, { type: 'content', content: 'Rust 是' }, 2);
    tree = processEventToTree(tree, { type: 'content', content: 'Go 是' }, 4);
    tree = processEventToTree(tree, { type: 'content', content: '一门系统语言' }, 2);
    tree = processEventToTree(tree, { type: 'content', content: '一门并发语言' }, 4);

    expect(tree.messages[1].blocks).toEqual([{ type: 'content', content: 'Rust 是一门系统语言' }]);
    expect(tree.messages[3].blocks).toEqual([{ type: 'content', content: 'Go 是一门并发语言' }]);
  });

  it('ignores events whose target is not an assistant message', () => {
    const tree = setupTwoRuns();
    const next = processEventToTree(tree, { type: 'content', content: 'oops' }, 1);
    expect(next.messages[0].blocks).toEqual([{ type: 'content', content: 'Rust?' }]);
  });

  it('routes error events to the owning run only', () => {
    let tree = setupTwoRuns();
    tree = processEventToTree(tree, { type: 'content', content: 'Go 是' }, 4);
    tree = processEventToTree(tree, { type: 'error', message: 'provider down' }, 2);

    expect(tree.messages[1].blocks).toEqual([{ type: 'error', message: 'provider down' }]);
    expect(tree.messages[3].blocks).toEqual([{ type: 'content', content: 'Go 是' }]);
  });
});
