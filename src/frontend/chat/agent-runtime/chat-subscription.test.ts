import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush } from 'solid-js';
import { chatState, registerChatToast } from './chat-state';
import { cancelStreamSubscription, openEventSubscription } from './chat-subscription';
import { resetLastEventId } from './event-handlers';
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
  cancelStreamSubscription(chatState, 'test cleanup');
  resetLastEventId();
  clearMessageTree();
  chatState.setStatus('idle');
  vi.unstubAllGlobals();
});

describe('chat subscription', () => {
  it('reads split SSE frames and keeps the replay cursor in the request header', async () => {
    registerChatToast({ info: notify, success: notify, warning: notify, error: notify });
    initializeMessageTree([createAssistantMessage()], [1]);
    flush();

    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          const frames = [
            {
              event: 'sync_response',
              data: { status: 'running', activeRuns: [1], recoveryRequired: false },
            },
            {
              event: 'chat_event',
              data: {
                eventId: 1,
                assistantMessageId: 1,
                event: { type: 'content', content: 'SSE 回复' },
              },
            },
            {
              event: 'chat_finished',
              data: { assistantMessageId: 1, remainingRuns: 0 },
            },
          ]
            .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
            .join('');

          controller.enqueue(encoder.encode(frames.slice(0, 23)));
          controller.enqueue(encoder.encode(frames.slice(23)));
          controller.close();
        },
      }),
    );
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);

    await openEventSubscription(chatState, 'conversation-1');
    flush();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/agents/conversation-runner/conversation-1/events'),
      expect.objectContaining({
        headers: { Accept: 'text/event-stream', 'Last-Event-ID': '0' },
      }),
    );
    expect(messages()[0]?.blocks).toEqual([{ type: 'content', content: 'SSE 回复' }]);
    expect(chatState.getStatus()).toBe('idle');
  });
});
