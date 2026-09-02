// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatServerToClientEvent } from '@/shared/chat/chat-api';
import { AnthropicChatProvider, type AnthropicMessage } from './anthropic';

type SseEvent = {
  type: string;
  [key: string]: unknown;
};

const MESSAGE_START: SseEvent = {
  type: 'message_start',
  message: {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-6',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 0 },
  },
};

const TEXT_START: SseEvent = {
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '', citations: null },
};

const TEXT_DELTA: SseEvent = {
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text: 'done' },
};

const TEXT_STOP: SseEvent = {
  type: 'content_block_stop',
  index: 0,
};

const END_TURN: SseEvent = {
  type: 'message_delta',
  delta: { container: null, stop_reason: 'end_turn', stop_sequence: null },
  usage: { output_tokens: 1 },
};

const MESSAGE_STOP: SseEvent = {
  type: 'message_stop',
};

const createSseResponse = (events: SseEvent[], ending: 'close' | 'error' | 'hang') => {
  const encoder = new TextEncoder();
  const chunk = encoder.encode(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
  );
  let sentEvents = false;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sentEvents) {
        sentEvents = true;
        controller.enqueue(chunk);
        return;
      }

      if (ending === 'close') {
        controller.close();
        return;
      }

      if (ending === 'hang') {
        return new Promise<void>(() => undefined);
      }

      controller.error(new Error('Network connection lost.'));
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'request-id': 'req_test',
    },
  });
};

const collectProviderRun = async () => {
  const provider = new AnthropicChatProvider({
    model: 'claude-opus-4-6',
    backendConfig: {
      apiKey: 'test-key',
      baseURL: 'https://api.example.test',
      defaultHeaders: { 'User-Agent': 'aether-test' },
    },
    tools: [],
    systemPrompt: '',
  });
  const messages: AnthropicMessage[] = [{ role: 'user', content: 'test' }];
  const iterator = provider.run(messages);
  const receivedEvents: ChatServerToClientEvent[] = [];

  while (true) {
    const result = await iterator.next();
    if (result.done) {
      return { events: receivedEvents, result: result.value };
    }
    receivedEvents.push(result.value);
  }
};

const runProvider = async (events: SseEvent[], ending: 'close' | 'error' | 'hang') => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => createSseResponse(events, ending)),
  );
  return collectProviderRun();
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AnthropicChatProvider streaming', () => {
  it('finishes at message_stop without waiting for the response body to close', async () => {
    const run = await runProvider(
      [MESSAGE_START, TEXT_START, TEXT_DELTA, TEXT_STOP, END_TURN, MESSAGE_STOP],
      'hang',
    );

    expect(run.events).toEqual([{ type: 'content', content: 'done' }]);
    expect(run.result).toEqual({
      pendingToolCalls: [],
      thinkingBlocks: [],
      assistantText: 'done',
    });
  }, 2000);

  it('keeps a complete answer when the connection is lost after stop_reason', async () => {
    const run = await runProvider(
      [MESSAGE_START, TEXT_START, TEXT_DELTA, TEXT_STOP, END_TURN],
      'error',
    );

    expect(run.events).toEqual([{ type: 'content', content: 'done' }]);
    expect(run.result.assistantText).toBe('done');
  });

  it('reports a connection loss that happens before stop_reason', async () => {
    const run = await runProvider([MESSAGE_START, TEXT_START, TEXT_DELTA], 'error');

    expect(run.events).toEqual([
      { type: 'content', content: 'done' },
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({
          code: 'network_error',
          details: 'Network connection lost.',
        }),
      }),
    ]);
    expect(run.result).toEqual({
      pendingToolCalls: [],
      thinkingBlocks: [],
      assistantText: '',
    });
  });

  it.each([
    { status: 401, code: 'authentication_failed' },
    { status: 429, code: 'rate_limit' },
  ])('preserves HTTP $status provider error classification', async ({ status, code }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'provider_error', message: 'request rejected' },
            }),
            {
              status,
              headers: {
                'content-type': 'application/json',
                'request-id': 'req_http_error',
                'x-should-retry': 'false',
              },
            },
          ),
      ),
    );

    const run = await collectProviderRun();

    expect(run.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code, status }),
      }),
    ]);
  });

  it('does not recover when stop_reason arrives before the content block is closed', async () => {
    const run = await runProvider([MESSAGE_START, TEXT_START, TEXT_DELTA, END_TURN], 'error');

    expect(run.events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: 'network_error' }),
      }),
    );
  });

  it('recovers a complete tool call after stop_reason', async () => {
    const run = await runProvider(
      [
        MESSAGE_START,
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tool_1', name: 'search', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"query":"test"}' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { container: null, stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 1 },
        },
      ],
      'error',
    );

    expect(run.events).toEqual([
      {
        type: 'tool_call',
        tool: 'search',
        args: { query: 'test' },
        callId: 'tool_1',
      },
    ]);
    expect(run.result.pendingToolCalls).toEqual([
      { id: 'tool_1', name: 'search', args: { query: 'test' } },
    ]);
  });

  it('does not recover an incomplete tool call', async () => {
    const run = await runProvider(
      [
        MESSAGE_START,
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tool_1', name: 'search', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"query":' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { container: null, stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 1 },
        },
      ],
      'error',
    );

    expect(run.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: 'provider_error' }),
      }),
    ]);
    expect(run.result.pendingToolCalls).toEqual([]);
  });

  it('reports a clean EOF that is missing message_stop', async () => {
    const run = await runProvider(
      [MESSAGE_START, TEXT_START, TEXT_DELTA, TEXT_STOP, END_TURN],
      'close',
    );

    expect(run.events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: 'provider_error' }),
      }),
    );
  });
});
