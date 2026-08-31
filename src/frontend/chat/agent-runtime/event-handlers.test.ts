import { afterEach, describe, expect, it } from 'vitest';
import { chatState, registerChatToast } from './chat-state';
import { handleServerMessage, resetLastEventId, flushStreamBuffer } from './event-handlers';
import {
  clearMessageTree,
  initializeMessageTree,
  messages,
} from '@/frontend/conversations/conversation-tree/message-tree-state';
import type { AssistantMessage } from '@/shared/chat/message';

const notify = () => '';

const createAssistantMessage = (): AssistantMessage => ({
  id: 1,
  parentId: null,
  prevSibling: null,
  nextSibling: null,
  latestChild: null,
  role: 'assistant',
  blocks: [],
  createdAt: '2026-08-25T00:00:00.000Z',
  completedAt: null,
});

afterEach(() => {
  flushStreamBuffer();
  resetLastEventId();
  clearMessageTree();
  chatState.setStatus('idle');
});

describe('event handlers', () => {
  it('flushes replayed content and requests snapshot recovery when the cache is gone', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    initializeMessageTree([createAssistantMessage()], [1]);

    const recoveryRequired = handleServerMessage(
      chatState,
      {
        event: 'sync_response',
        data: {
          status: 'completed',
          recoveryRequired: true,
          events: [
            {
              eventId: 1,
              assistantMessageId: 1,
              event: { type: 'content', content: '完整回复' },
            },
          ],
        },
      },
      'conversation-1',
    );

    expect(recoveryRequired).toBe(true);
    expect(messages()[0]?.blocks).toEqual([{ type: 'content', content: '完整回复' }]);
  });

  it('keeps event cursors isolated between conversations', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
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
      'conversation-a',
    );
    handleServerMessage(
      chatState,
      {
        event: 'chat_event',
        data: {
          eventId: 1,
          assistantMessageId: 1,
          event: { type: 'content', content: '重复' },
        },
      },
      'conversation-a',
    );
    handleServerMessage(
      chatState,
      {
        event: 'chat_event',
        data: {
          eventId: 1,
          assistantMessageId: 1,
          event: { type: 'content', content: 'B' },
        },
      },
      'conversation-b',
    );
    flushStreamBuffer();

    expect(messages()[0]?.blocks).toEqual([{ type: 'content', content: 'AB' }]);
  });

  it('keeps structured errors in the conversation tree', () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    initializeMessageTree([createAssistantMessage()], [1]);

    handleServerMessage(
      chatState,
      {
        event: 'chat_event',
        data: {
          eventId: 1,
          assistantMessageId: 1,
          event: {
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
        },
      },
      'conversation-1',
    );

    expect(messages()[0]?.blocks).toEqual([
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
  });
});
