import { describe, expect, it } from 'vitest';
import { applyOperation } from '@/backend/conversations/operation';
import type { ChatServerToClientEvent } from '@/shared/chat/chat-api';
import { cloneTreeSnapshot, processEventToTree } from './event-processor';

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
    tree = processEventToTree(
      tree,
      {
        type: 'error',
        message: 'OpenAI request failed',
        error: {
          code: 'server_error',
          provider: 'openai',
          model: 'gpt-5.4',
          backend: 'api.example.com/v1',
          status: 500,
          retryable: true,
          details: 'upstream unavailable',
        },
      },
      2,
    );

    expect(tree.messages[1].blocks).toEqual([
      {
        type: 'error',
        message: 'OpenAI request failed',
        error: {
          code: 'server_error',
          provider: 'openai',
          model: 'gpt-5.4',
          backend: 'api.example.com/v1',
          status: 500,
          retryable: true,
          details: 'upstream unavailable',
        },
      },
    ]);
    expect(tree.messages[3].blocks).toEqual([{ type: 'content', content: 'Go 是' }]);
  });

  it('matches same-name tool results by call ID and preserves IDs when cloning', () => {
    let tree = setupTwoRuns();
    tree = processEventToTree(
      tree,
      { type: 'tool_call', tool: 'search', args: { query: 'first' }, callId: 'call-1' },
      2,
    );
    tree = processEventToTree(
      tree,
      { type: 'tool_call', tool: 'search', args: { query: 'second' }, callId: 'call-2' },
      2,
    );
    tree = processEventToTree(
      tree,
      { type: 'tool_result', tool: 'search', result: 'first result', callId: 'call-1' },
      2,
    );
    tree = processEventToTree(
      tree,
      { type: 'tool_result', tool: 'search', result: 'second result', callId: 'call-2' },
      2,
    );

    expect(cloneTreeSnapshot(tree).messages[1].blocks).toEqual([
      {
        type: 'research',
        items: [
          {
            kind: 'tool',
            data: {
              call: { tool: 'search', args: { query: 'first' }, callId: 'call-1' },
              result: { result: 'first result' },
            },
          },
          {
            kind: 'tool',
            data: {
              call: { tool: 'search', args: { query: 'second' }, callId: 'call-2' },
              result: { result: 'second result' },
            },
          },
        ],
      },
    ]);
  });

  it('preserves an unmatched tool result without attaching it to another call', () => {
    let tree = setupTwoRuns();
    tree = processEventToTree(
      tree,
      { type: 'tool_call', tool: 'search', args: { query: 'known' }, callId: 'known-call' },
      2,
    );
    tree = processEventToTree(
      tree,
      { type: 'tool_result', tool: 'search', result: 'orphan', callId: 'unknown-call' },
      2,
    );

    expect(tree.messages[1].blocks).toEqual([
      {
        type: 'research',
        items: [
          {
            kind: 'tool',
            data: {
              call: { tool: 'search', args: { query: 'known' }, callId: 'known-call' },
            },
          },
          {
            kind: 'tool',
            data: {
              call: { tool: 'search', args: {}, callId: 'unknown-call' },
              result: { result: 'orphan' },
            },
          },
        ],
      },
    ]);
  });

  it('keeps one render item when a tool call and result are replayed', () => {
    let tree = setupTwoRuns();
    const events: ChatServerToClientEvent[] = [
      {
        type: 'tool_call',
        tool: 'render',
        args: { code: '<main>Demo</main>' },
        callId: 'render-1',
      },
      { type: 'content', content: 'Rendered above.' },
      {
        type: 'tool_call',
        tool: 'render',
        args: { code: '<main>Demo</main>' },
        callId: 'render-1',
      },
      {
        type: 'tool_result',
        tool: 'render',
        result: 'HTML rendered successfully.',
        callId: 'render-1',
      },
      {
        type: 'tool_result',
        tool: 'render',
        result: 'HTML rendered successfully.',
        callId: 'render-1',
      },
    ];

    for (const event of events) {
      tree = processEventToTree(tree, event, 2);
    }

    expect(tree.messages[1].blocks).toEqual([
      {
        type: 'research',
        items: [
          {
            kind: 'tool',
            data: {
              call: {
                tool: 'render',
                args: { code: '<main>Demo</main>' },
                callId: 'render-1',
              },
              result: { result: 'HTML rendered successfully.' },
            },
          },
        ],
      },
      { type: 'content', content: 'Rendered above.' },
    ]);
  });
});
