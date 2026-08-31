import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssistantMessage, UserMessage } from '@/shared/chat/message';
import {
  appendToAssistant,
  applyChatAccepted,
  clearMessageTree,
  currentPath,
  initializeMessageTree,
  messages,
  useCurrentPath,
  useMessage,
  useMessages,
} from './message-tree-state';

afterEach(() => {
  act(() => clearMessageTree());
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

    const observedSnapshots: { messageCount: number; path: number[] }[] = [];
    renderHook(() => {
      const snapshot = { messageCount: useMessages().length, path: useCurrentPath() };
      observedSnapshots.push(snapshot);
      return snapshot;
    });

    act(() => applyChatAccepted(userMessage, assistantMessage));

    expect(messages()).toEqual([userMessage, assistantMessage]);
    expect(currentPath()).toEqual([1, 2]);
    expect(observedSnapshots).not.toContainEqual({ messageCount: 2, path: [] });
    expect(observedSnapshots).not.toContainEqual({ messageCount: 0, path: [1, 2] });
    expect(observedSnapshots.at(-1)).toEqual({ messageCount: 2, path: [1, 2] });
  });

  it('keeps the path and unrelated message slices stable during streaming', () => {
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

    act(() => initializeMessageTree([userMessage, assistantMessage], [1, 2]));
    const path = renderHook(() => useCurrentPath());
    const user = renderHook(() => useMessage(1));
    const assistant = renderHook(() => useMessage(2));
    const originalPath = path.result.current;
    const originalUser = user.result.current;
    const originalAssistant = assistant.result.current;

    act(() => appendToAssistant(2, { type: 'content', content: 'World' }));

    expect(path.result.current).toBe(originalPath);
    expect(user.result.current).toBe(originalUser);
    expect(assistant.result.current).not.toBe(originalAssistant);
    expect(assistant.result.current?.blocks).toEqual([{ type: 'content', content: 'World' }]);
  });
});
