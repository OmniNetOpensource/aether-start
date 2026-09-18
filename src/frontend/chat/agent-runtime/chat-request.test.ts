import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Operation } from '@/shared/chat/chat-api';
import { chatState, type ChatState } from './chat-state';
import { startChatRequest } from './chat-request';

vi.mock('./chat-subscription', async () => ({
  ...(await vi.importActual<typeof import('./chat-subscription')>('./chat-subscription')),
  hasActiveEventSubscription: () => false,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chat request', () => {
  it('sends the selected model without prompt or fetch provider choices', async () => {
    const operation: Operation = {
      type: 'regenerate',
      currentMessageId: 1,
    };
    const notify = vi.fn();
    const runtime: ChatState = {
      ...chatState,
      getConversationId: () => 'conversation-1',
      getCurrentModelId: () => 'model-1',
      setStatus: vi.fn(),
      toast: { info: notify, success: notify, warning: notify, error: notify },
    };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await startChatRequest(runtime, operation);

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== 'string') throw new Error('Chat request body was not serialized');
    expect(JSON.parse(requestBody)).toEqual({
      idempotencyKey: expect.any(String),
      model: 'model-1',
      conversationId: 'conversation-1',
      operation,
    });
  });
});
