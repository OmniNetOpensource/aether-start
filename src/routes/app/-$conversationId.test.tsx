import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderTest } from '@/test/render';
import {
  clearMessageTree,
  currentPath,
  useMessages,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import {
  clearConversationMeta,
  conversationId,
  pageTitle,
} from '@/frontend/conversations/session/conversation-meta';
import { currentModelId, setCurrentModelId } from '@/frontend/conversations/session/chat-selection';
import { DEFAULT_MODEL_ID } from '@/shared/chat/model-catalog';

vi.mock('@/frontend/chat/agent-runtime/chat-orchestrator', () => ({
  cancelStreamSubscription: vi.fn(),
  resumeRunningConversation: vi.fn(),
}));

vi.mock('@/frontend/chat/message-thread/MessageList', () => ({
  MessageList: () => {
    const messages = useMessages();
    return messages.flatMap((message) =>
      message.blocks.flatMap((block) =>
        block.type === 'content' ? <p key={message.id}>{block.content}</p> : [],
      ),
    );
  },
}));

import { Route } from './$conversationId';

afterEach(() => {
  vi.restoreAllMocks();
  clearConversationMeta();
  clearMessageTree();
  setCurrentModelId(DEFAULT_MODEL_ID);
});

describe('conversation route direct hydration', () => {
  it('restores persisted messages when the route component mounts from loader data', () => {
    const conversation = {
      id: 'conversation-1',
      title: 'History',
      model: 'history-model',
      messages: [
        {
          id: 1,
          parentId: null,
          prevSibling: null,
          nextSibling: null,
          latestChild: 2,
          role: 'user',
          blocks: [{ type: 'content', content: '历史问题' }],
          createdAt: '2026-08-31T00:00:00.000Z',
          completedAt: null,
        },
        {
          id: 2,
          parentId: 1,
          prevSibling: null,
          nextSibling: null,
          latestChild: null,
          role: 'assistant',
          blocks: [{ type: 'content', content: '历史回答' }],
          createdAt: '2026-08-31T00:00:01.000Z',
          completedAt: '2026-08-31T00:00:02.000Z',
        },
      ],
    };

    vi.spyOn(Route, 'useLoaderData').mockReturnValue({ conversation });
    vi.spyOn(Route, 'useParams').mockReturnValue({ conversationId: conversation.id });

    const ConversationPage = Route.options.component;
    if (!ConversationPage) throw new Error('Conversation route has no component');
    renderTest(() => <ConversationPage />);

    expect(conversationId()).toBe(conversation.id);
    expect(pageTitle()).toBe(conversation.title);
    expect(currentModelId()).toBe(conversation.model);
    expect(currentPath()).toEqual([1, 2]);
    expect(screen.getByText('历史问题')).toBeTruthy();
    expect(screen.getByText('历史回答')).toBeTruthy();
  });
});
