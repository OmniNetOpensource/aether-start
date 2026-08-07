import { flush } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssistantMessage, UserMessage } from '@/shared/chat/message';
import { applyChatAccepted, clearMessageTree, currentPath, messages } from './message-tree-state';

afterEach(() => {
  clearMessageTree();
  flush();
});

describe('applyChatAccepted', () => {
  it('adds the first messages and selects the assistant path atomically', () => {
    const userMessage: UserMessage = {
      id: 1,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      latestChild: 2,
      role: 'user',
      blocks: [{ type: 'content', content: 'Hello' }],
      createdAt: '2026-08-08T00:00:00.000Z',
      completedAt: null,
    };
    const assistantMessage: AssistantMessage = {
      id: 2,
      parentId: 1,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [],
      createdAt: '2026-08-08T00:00:00.000Z',
      completedAt: null,
    };

    applyChatAccepted(userMessage, assistantMessage);
    flush();

    expect(messages()).toEqual([userMessage, assistantMessage]);
    expect(currentPath()).toEqual([1, 2]);
  });
});
