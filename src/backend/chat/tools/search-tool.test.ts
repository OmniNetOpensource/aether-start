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
  vi.stubEnv('JUSTONEAPI_TOKEN', '');
});

afterEach(() => {
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

  it('searches Weixin articles through Just One API and flattens result groups', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'justone-test-token');
    const requests = stubJsonFetch({
      code: 0,
      message: null,
      data: {
        data: [
          {
            items: [
              {
                title: '<em class="highlight">微信</em>文章',
                desc: '<em class="highlight">文章</em>摘要',
                doc_url: 'http://mp.weixin.qq.com/s/example',
              },
              { title: '缺少链接' },
            ],
          },
          { items: 'invalid' },
        ],
      },
      recordTime: null,
    });

    const result = await searchTool.handler({ query: '人工智能', platform: 'weixin' });
    const request = getOnlyRequest(requests);
    const parameters = new URLSearchParams(String(request.init?.body));

    expect(String(request.input)).toBe('https://api.justoneapi.com/api/weixin/search-article/v1');
    expect(request.init?.method).toBe('POST');
    expect(parameters.get('token')).toBe('justone-test-token');
    expect(parameters.get('keyword')).toBe('人工智能');
    expect(parameters.get('publishTimeType')).toBe('ALL');
    expect(parameters.get('sortType')).toBe('COMPREHENSIVE');
    expect(parameters.get('currentPage')).toBe('1');
    expect(parameters.get('offset')).toBe('0');
    expect(parameters.get('cookies_buffer')).toBe('');
    expect(JSON.parse(result)).toEqual({
      client: {
        results: [
          {
            title: '微信文章',
            url: 'http://mp.weixin.qq.com/s/example',
          },
        ],
      },
      ai:
        '[1]title: 微信文章\n' +
        '[1]description: 文章摘要\n' +
        '[1]url: http://mp.weixin.qq.com/s/example',
    });
  });

  it('searches RedNote through Just One API and creates fetchable note URLs', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'justone-test-token');
    const requests = stubJsonFetch({
      code: 0,
      message: null,
      data: {
        notes: [
          {
            id: '68b1234567890abcdef1234',
            title: '小红书笔记',
            desc: '笔记摘要',
          },
          { id: 'missing-title' },
        ],
      },
      recordTime: null,
    });

    const result = await searchTool.handler({ query: '旅行', platform: 'rednote' });
    const request = getOnlyRequest(requests);
    const url = new URL(String(request.input));

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://api.justoneapi.com/api/xiaohongshu/search-note/v4',
    );
    expect(request.init?.method).toBe('GET');
    expect(url.searchParams.get('token')).toBe('justone-test-token');
    expect(url.searchParams.get('keyword')).toBe('旅行');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('sortType')).toBe('general');
    expect(url.searchParams.get('noteType')).toBe('ALL');
    expect(url.searchParams.get('timeFilter')).toBe('ALL');
    expect(JSON.parse(result)).toEqual({
      client: {
        results: [
          {
            title: '小红书笔记',
            url: 'https://www.xiaohongshu.com/explore/68b1234567890abcdef1234',
          },
        ],
      },
      ai:
        '[1]title: 小红书笔记\n' +
        '[1]description: 笔记摘要\n' +
        '[1]url: https://www.xiaohongshu.com/explore/68b1234567890abcdef1234',
    });
  });

  it('returns Just One API failures without falling back to Google', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'justone-test-token');
    vi.stubEnv('SERP_API_KEY', 'serper-test-token');
    const requests = stubJsonFetch({
      code: 602,
      message: 'TOKEN limit exceeded',
      data: null,
      recordTime: null,
    });

    const result = await searchTool.handler({ query: '旅行', platform: 'rednote' });
    const request = getOnlyRequest(requests);

    expect(result).toMatch(/^Error: /);
    expect(String(request.input)).toContain('/api/xiaohongshu/search-note/v4');
  });

  it('reports a missing Just One token without making a request', async () => {
    const requests = stubJsonFetch({});

    expect(await searchTool.handler({ query: '旅行', platform: 'rednote' })).toBe(
      'Error: JUSTONEAPI_TOKEN is not set',
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

  it('reports an invalid platform response as an error', async () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'justone-test-token');
    stubJsonFetch({
      code: 0,
      message: null,
      data: { items: [] },
      recordTime: null,
    });

    const result = await searchTool.handler({ query: '旅行', platform: 'rednote' });

    expect(result).toBe('Error: Invalid rednote search response');
  });
});
