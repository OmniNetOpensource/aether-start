import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { ToastProvider } from '@/frontend/app-shell/toast-context';
import { registerChatToast } from '@/frontend/chat/agent-runtime/chat-state';
import {
  applyChatAccepted,
  clearMessageTree,
  initializeMessageTree,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import type { AssistantMessage, UserMessage } from '@/shared/chat/message';
import { MessageList } from './MessageList';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => async () => {},
}));

const notify = () => '';

afterEach(clearMessageTree);

describe('MessageList scroll position', () => {
  it('keeps the existing viewport when another message is accepted', async () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    initializeMessageTree(
      [
        {
          id: 1,
          parentId: null,
          prevSibling: null,
          nextSibling: null,
          latestChild: 2,
          role: 'user',
          blocks: [{ type: 'content', content: '第一条消息' }],
          createdAt: '2026-08-10T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 2,
          parentId: 1,
          prevSibling: null,
          nextSibling: null,
          latestChild: null,
          role: 'assistant',
          blocks: [{ type: 'content', content: '第一条回复' }],
          createdAt: '2026-08-10T00:00:01.000Z',
          completedAt: '2026-08-10T00:00:02.000Z',
        },
      ],
      [1, 2],
    );

    const { container } = renderTest(() => (
      <ToastProvider>
        <MessageList />
      </ToastProvider>
    ));
    const scrollElement = container.querySelector('[data-testid="message-scroll"]');
    if (!(scrollElement instanceof HTMLElement)) throw new Error('Message scroll not found');
    scrollElement.scrollTop = 240;

    const userMessage: UserMessage = {
      id: 3,
      parentId: 2,
      prevSibling: null,
      nextSibling: null,
      latestChild: 4,
      role: 'user',
      blocks: [{ type: 'content', content: '第二条消息' }],
      createdAt: '2026-08-10T00:01:00.000Z',
      completedAt: null,
    };
    const assistantMessage: AssistantMessage = {
      id: 4,
      parentId: 3,
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      role: 'assistant',
      blocks: [],
      createdAt: '2026-08-10T00:01:01.000Z',
      completedAt: null,
    };

    await act(() => applyChatAccepted(userMessage, assistantMessage));

    expect(container.querySelector('[data-testid="message-scroll"]')).toBe(scrollElement);
    expect(scrollElement.style.getPropertyValue('overflow-anchor')).toBe('none');
    expect(scrollElement.scrollTop).toBe(240);
    expect(container.textContent).toContain('第二条消息');
  });
});
