import { afterEach, describe, expect, it } from 'vitest';
import { Route } from './route';
import { chatState } from '@/frontend/chat/agent-runtime/chat-state';
import {
  flushStreamBuffer,
  handleServerMessage,
  resetLastEventId,
} from '@/frontend/chat/agent-runtime/event-handlers';
import {
  clearMessageTree,
  initializeMessageTree,
  messages,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import type { AssistantMessage } from '@/shared/chat/message';

const createAssistantMessage = (): AssistantMessage => ({
  id: 1,
  parentId: null,
  prevSibling: null,
  nextSibling: null,
  latestChild: null,
  role: 'assistant',
  blocks: [],
  createdAt: '2026-08-31T00:00:00.000Z',
  completedAt: null,
});

afterEach(() => {
  flushStreamBuffer();
  resetLastEventId();
  clearMessageTree();
  chatState.setStatus('idle');
});

describe('app route lifecycle', () => {
  it('keeps the replay cursor when leaving an unfinished conversation', () => {
    initializeMessageTree([createAssistantMessage()], [1]);

    handleServerMessage(
      chatState,
      {
        event: 'chat_event',
        data: {
          eventId: 1,
          assistantMessageId: 1,
          event: { type: 'content', content: 'A' },
        },
      },
      'conversation-1',
    );
    flushStreamBuffer();

    const onLeave = Reflect.get(Route.options, 'onLeave');
    if (typeof onLeave !== 'function') throw new Error('App route has no onLeave lifecycle');
    Reflect.apply(onLeave, undefined, []);

    handleServerMessage(
      chatState,
      {
        event: 'sync_response',
        data: {
          status: 'running',
          recoveryRequired: false,
          events: [
            {
              eventId: 1,
              assistantMessageId: 1,
              event: { type: 'content', content: 'A' },
            },
          ],
          activeRuns: [1],
        },
      },
      'conversation-1',
    );

    expect(messages()[0]?.blocks).toEqual([{ type: 'content', content: 'A' }]);
  });
});
