import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJustOneApi } from './justone-api';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('requestJustOneApi', () => {
  it('does not make a request when the token is missing', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestJustOneApi({
      endpoint: '/api/example/v1',
      method: 'GET',
      parameters: new URLSearchParams(),
    });

    expect(result).toEqual({ ok: false, error: 'JUSTONEAPI_TOKEN is not set' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('injects the token into GET query parameters and returns data', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'test-token');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ code: 0, message: null, data: { value: 'ok' }, recordTime: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestJustOneApi({
      endpoint: '/api/example/v1',
      method: 'GET',
      parameters: new URLSearchParams({ keyword: 'a&b' }),
    });

    expect(result).toEqual({ ok: true, data: { value: 'ok' } });
    const requestUrl = fetchMock.mock.calls[0]?.[0];
    expect(requestUrl).toBeInstanceOf(URL);
    expect(requestUrl?.toString()).toBe(
      'https://api.justoneapi.com/api/example/v1?keyword=a%26b&token=test-token',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('rejects redirects without following the token-bearing request', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'secret-test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { Location: 'https://example.com/redirected' },
          }),
      ),
    );

    const result = await requestJustOneApi({
      endpoint: '/api/example/v1',
      method: 'GET',
      parameters: new URLSearchParams(),
    });

    expect(result).toEqual({ ok: false, error: 'Just One API HTTP 302' });
    expect(JSON.stringify(result)).not.toContain('secret-test-token');
  });

  it('injects the token into a form POST body', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'test-token');
    const fetchMock = vi.fn(async () =>
      Response.json({ code: 0, message: null, data: 'ok', recordTime: null }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await requestJustOneApi({
      endpoint: '/api/example/v1',
      method: 'POST',
      parameters: new URLSearchParams({ keyword: 'query' }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://api.justoneapi.com/api/example/v1'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ keyword: 'query', token: 'test-token' }),
      }),
    );
  });

  it('rejects a non-zero business code without exposing the token', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'secret-test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          code: 302,
          message: 'Too many requests',
          requestId: 'request-1',
          recordTime: null,
        }),
      ),
    );

    const result = await requestJustOneApi({
      endpoint: '/api/example/v1',
      method: 'GET',
      parameters: new URLSearchParams(),
    });

    expect(result).toEqual({
      ok: false,
      error: 'Just One API request failed (code 302, Too many requests, requestId request-1)',
    });
    expect(JSON.stringify(result)).not.toContain('secret-test-token');
  });

  it('returns a safe HTTP error for a non-JSON response', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'secret-test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failure', { status: 503 })),
    );

    const result = await requestJustOneApi({
      endpoint: '/api/example/v1',
      method: 'GET',
      parameters: new URLSearchParams(),
    });

    expect(result).toEqual({ ok: false, error: 'Just One API HTTP 503' });
    expect(JSON.stringify(result)).not.toContain('secret-test-token');
  });

  it('uses the supplied timeout for the actual fetch', async () => {
    vi.useFakeTimers();
    vi.stubEnv('JUSTONEAPI_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );

    const resultPromise = requestJustOneApi(
      {
        endpoint: '/api/example/v1',
        method: 'GET',
        parameters: new URLSearchParams(),
      },
      undefined,
      50,
    );
    await vi.advanceTimersByTimeAsync(50);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: 'Just One API request timed out',
    });
  });

  it('propagates a parent abort', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'test-token');
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestJustOneApi(
        {
          endpoint: '/api/example/v1',
          method: 'GET',
          parameters: new URLSearchParams(),
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
