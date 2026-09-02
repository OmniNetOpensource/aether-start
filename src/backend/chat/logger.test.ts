import { beforeEach, describe, expect, it, vi } from 'vitest';

const serverEnv = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

vi.mock('@/backend/platform/cloudflare/env', () => serverEnv);

import { log, logProviderCommunication } from './logger';

beforeEach(() => {
  serverEnv.getServerEnv.mockReset();
  serverEnv.getServerEnv.mockReturnValue({
    LLM_STREAM_LOGGING: 'anthropic',
    LLM_STREAM_LOGGING_MAX_CHARS: '0',
  });
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('serializes nested errors, causes, custom fields, bigints, and circular references', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cause = Object.assign(new Error('socket closed'), {
      code: 'ECONNRESET',
      details: { attempt: 1n },
      authorization: 'Bearer hidden',
    });
    const error = Object.assign(new Error('provider failed', { cause }), {
      retryable: true,
      response: { status: 502 },
    });
    const data: Record<string, unknown> = { error };
    data.self = data;

    expect(() => log('anthropic', 'request failed', data)).not.toThrow();

    const output = consoleLog.mock.calls[0]?.[0];
    if (typeof output !== 'string') throw new Error('Expected a serialized log entry');

    expect(JSON.parse(output)).toMatchObject({
      cat: 'anthropic',
      msg: 'request failed',
      data: {
        error: {
          name: 'Error',
          message: 'provider failed',
          stack: expect.any(String),
          cause: {
            name: 'Error',
            message: 'socket closed',
            stack: expect.any(String),
            code: 'ECONNRESET',
            details: { attempt: '1' },
            authorization: '[REDACTED]',
          },
          retryable: true,
          response: { status: 502 },
        },
        self: '[Circular]',
      },
    });
  });

  it('redacts provider secrets recursively without losing nested error details', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = Object.assign(
      new Error('upstream failed', {
        cause: { authorization: 'Bearer hidden', reason: 'reset' },
      }),
      {
        token: 'secret-token',
        metadata: { client_secret: 'hidden', safe: 'visible' },
      },
    );
    const data: Record<string, unknown> = {
      apiKey: 'root-secret',
      payload: {
        authorization: 'Bearer hidden',
        nested: { api_key: 'hidden', accessToken: 'hidden', safe: 'visible' },
      },
      error,
    };
    data.self = data;

    expect(() =>
      logProviderCommunication('anthropic', 'provider response failed', data),
    ).not.toThrow();

    const output = consoleLog.mock.calls[0]?.[0];
    if (typeof output !== 'string') throw new Error('Expected a serialized provider log entry');

    expect(JSON.parse(output)).toMatchObject({
      cat: 'ANTHROPIC',
      msg: 'provider response failed',
      data: {
        apiKey: '[REDACTED]',
        payload: {
          authorization: '[REDACTED]',
          nested: {
            api_key: '[REDACTED]',
            accessToken: '[REDACTED]',
            safe: 'visible',
          },
        },
        error: {
          name: 'Error',
          message: 'upstream failed',
          stack: expect.any(String),
          cause: { authorization: '[REDACTED]', reason: 'reset' },
          token: '[REDACTED]',
          metadata: { client_secret: '[REDACTED]', safe: 'visible' },
        },
        self: '[Circular]',
      },
    });
  });
});
