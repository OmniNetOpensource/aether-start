import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchTool } from './search-tool';

type CapturedRequest = {
  input: string | URL | Request;
  init?: RequestInit;
};

const stubJsonFetch = (body: unknown, status = 200) => {
  const requests: CapturedRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ input, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return requests;
};

const getOnlyRequest = (requests: CapturedRequest[]) => {
  expect(requests).toHaveLength(1);
  const request = requests[0];
  if (!request) {
    throw new Error('Expected one request');
  }
  return request;
};

beforeEach(() => {
  vi.stubEnv('SERP_API_KEY', '');
  vi.stubEnv('EVERYINFRA_API_KEY', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('search tool', () => {
  it('declares google as the optional default platform', () => {
    expect(searchTool.spec.function.parameters).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        platform: {
          type: 'string',
          enum: ['google', 'weixin', 'rednote'],
          default: 'google',
          description: 'Search platform. Omit for Google.',
        },
      },
      required: ['query'],
    });
  });

  it('uses Google when platform is omitted', async () => {
    vi.stubEnv('SERP_API_KEY', 'serper-test-token');
    const requests = stubJsonFetch({
      organic: [
        {
          title: 'Example result',
          link: 'https://example.com/result',
          snippet: 'Example description',
        },
      ],
    });

    const result = await searchTool.handler({ query: 'example query' });
    const request = getOnlyRequest(requests);

    expect(String(request.input)).toBe('https://google.serper.dev/search');
    expect(request.init?.method).toBe('POST');
    expect(new Headers(request.init?.headers).get('X-API-KEY')).toBe('serper-test-token');
    expect(JSON.parse(String(request.init?.body))).toEqual({ q: 'example query' });
    expect(JSON.parse(result)).toEqual({
      client: {
        results: [{ title: 'Example result', url: 'https://example.com/result' }],
      },
      ai:
        '[1]title: Example result\n' +
        '[1]description: Example description\n' +
        '[1]url: https://example.com/result',
    });
  });

  it.each([
    {
      platform: 'weixin',
      providerPlatform: 'wechat_oa',
      action: 'article_search',
      summary: '文章摘要',
    },
    { platform: 'rednote', providerPlatform: 'xiaohongshu', action: 'search', text: '笔记摘要' },
  ])('searches $platform through EveryInfra and preserves the result contract', async (example) => {
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    const resultUrl =
      example.platform === 'rednote'
        ? 'https://www.xiaohongshu.com/explore/note123?xsec_token=token%2Bvalue&xsec_source=pc_search'
        : 'http://mp.weixin.qq.com/s?__biz=example&mid=1#rd';
    const requests = stubJsonFetch({
      id: 'req-success',
      results: [
        { title: '搜索结果', url: resultUrl, summary: example.summary, text: example.text },
        { title: '缺少链接' },
        { url: 'https://example.com/missing-title' },
        null,
      ],
    });

    const result = await searchTool.handler({ query: '熊拖泥', platform: example.platform });
    const request = getOnlyRequest(requests);
    expect(String(request.input)).toBe('https://api.everyinfra.com/api/v1/social');
    expect(request.init?.method).toBe('POST');
    expect(request.init?.redirect).toBe('manual');
    expect(new Headers(request.init?.headers).get('Authorization')).toBe(
      'Bearer everyinfra-test-key',
    );
    expect(new Headers(request.init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(request.init?.body))).toEqual({
      platform: example.providerPlatform,
      action: example.action,
      params: { keyword: '熊拖泥' },
    });
    expect(JSON.parse(result)).toEqual({
      client: { results: [{ title: '搜索结果', url: resultUrl }] },
      ai: `[1]title: 搜索结果\n[1]description: ${example.summary ?? example.text}\n[1]url: ${resultUrl}`,
    });
  });

  it('returns provider failures and request IDs without retrying or switching providers', async () => {
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    vi.stubEnv('SERP_API_KEY', 'serper-test-key');
    const requests = stubJsonFetch(
      {
        error: {
          code: 'unavailable',
          message: 'Temporarily unavailable',
          request_id: 'req-failed',
        },
      },
      503,
    );
    expect(await searchTool.handler({ query: '熊拖泥', platform: 'weixin' })).toBe(
      'Error: EveryInfra HTTP 503 (unavailable, Temporarily unavailable, req-failed)',
    );
    expect(String(getOnlyRequest(requests).input)).toBe('https://api.everyinfra.com/api/v1/social');
  });

  it('does not mistake an HTTP 200 error envelope for empty search results', async () => {
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    stubJsonFetch({ error: { code: 'failed', message: 'Search failed', request_id: 'req-error' } });
    expect(await searchTool.handler({ query: '熊拖泥', platform: 'rednote' })).toBe(
      'Error: EveryInfra HTTP 200 (failed, Search failed, req-error)',
    );
  });

  it('reports a missing EveryInfra key without using the legacy token', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'legacy-token');
    const requests = stubJsonFetch({});
    expect(await searchTool.handler({ query: '熊拖泥', platform: 'rednote' })).toBe(
      'Error: EVERYINFRA_API_KEY is not set',
    );
    expect(requests).toHaveLength(0);
  });

  it('rejects an invalid platform without making a request', async () => {
    const requests = stubJsonFetch({});
    await expect(searchTool.handler({ query: 'example', platform: 'unknown' })).rejects.toThrow(
      'search platform must be google, weixin, or rednote',
    );
    expect(requests).toHaveLength(0);
  });

  it('distinguishes an invalid response from a valid empty result', async () => {
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    stubJsonFetch({ results: null });
    expect(await searchTool.handler({ query: '熊拖泥', platform: 'rednote' })).toBe(
      'Error: Invalid rednote search response from EveryInfra',
    );
    stubJsonFetch({ results: [] });
    expect(JSON.parse(await searchTool.handler({ query: '熊拖泥', platform: 'rednote' }))).toEqual({
      client: { results: [] },
      ai: 'No valid search results.',
    });
  });

  it('reports a non-JSON HTTP failure with its status', async () => {
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failed', { status: 502 })),
    );
    expect(await searchTool.handler({ query: '熊拖泥', platform: 'weixin' })).toBe(
      'Error: EveryInfra HTTP 502 returned invalid JSON',
    );
  });

  it('preserves unexpected network errors for the tool executor', async () => {
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network failed');
      }),
    );
    await expect(searchTool.handler({ query: '熊拖泥', platform: 'weixin' })).rejects.toThrow(
      'network failed',
    );
  });

  it('aborts an outstanding provider request after 120 seconds', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const result = searchTool.handler({ query: '熊拖泥', platform: 'weixin' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toBe('Error: EveryInfra request timed out');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates caller cancellation and cleans up the timeout', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EVERYINFRA_API_KEY', 'everyinfra-test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const result = searchTool.handler({ query: '熊拖泥', platform: 'rednote' }, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
