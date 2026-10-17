import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./shared/rate-limit', () => ({
  createRateLimitedQueue:
    () =>
    <T>(task: () => Promise<T>): Promise<T> =>
      task(),
}));

import { fetchUrlTool } from './fetch-tool';

beforeEach(() => {
  vi.stubEnv('PARALLEL_API_KEY', 'test-parallel-key');
  vi.stubEnv('EVERYINFRA_API_KEY', 'test-everyinfra-key');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetch_url markdown routing', () => {
  it('fetches full webpage markdown through Parallel', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        extract_id: 'extract-test',
        results: [{ full_content: '# Page body', excerpts: ['short excerpt'] }],
        errors: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUrlTool.handler({
      url: 'https://example.com/article',
    });

    expect(result).toBe('# Page body');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.parallel.ai/v1/extract',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-parallel-key',
        },
        body: JSON.stringify({
          urls: ['https://example.com/article'],
          advanced_settings: {
            full_content: true,
            fetch_policy: {
              max_age_seconds: 600,
              timeout_seconds: 60,
              disable_cache_fallback: true,
            },
          },
        }),
      }),
    );
  });

  it.each([
    'https://mp.weixin.qq.com.evil.test/s?mid=1',
    'https://mp.weixin.qq.com/profile',
    'https://www.xiaohongshu.com/user/profile/123',
    'https://www.reddit.com.evil.test/r/test/comments/abc/title',
  ])('does not route a lookalike or unsupported URL through Just One API: %s', async (url) => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        extract_id: 'extract-test',
        results: [{ full_content: 'page', excerpts: [] }],
        errors: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchUrlTool.handler({ url })).toBe('page');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.parallel.ai/v1/extract',
      expect.objectContaining({ body: expect.stringContaining(JSON.stringify(url)) }),
    );
  });

  it('does not expose response modes after splitting the read tools', async () => {
    expect(fetchUrlTool.spec.function.parameters).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { url: { type: 'string', description: 'The webpage or article URL to read' } },
      required: ['url'],
    });
    await expect(
      fetchUrlTool.handler({ url: 'https://example.com/image.png', response_type: 'image' }),
    ).rejects.toThrow();
  });
});

describe('fetch_url Parallel failures and cancellation', () => {
  it('reports a missing key without making a request', async () => {
    vi.stubEnv('PARALLEL_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchUrlTool.handler({ url: 'https://example.com' })).toBe(
      'Error: PARALLEL_API_KEY is not set',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 429, 503])('preserves HTTP %s error details', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { type: 'error', error: { message: 'Upstream failure', ref_id: 'error-test' } },
          { status },
        ),
      ),
    );

    expect(await fetchUrlTool.handler({ url: 'https://example.com' })).toBe(
      `Error: Parallel HTTP ${status}: Upstream failure (ref_id error-test)`,
    );
  });

  it('treats a per-URL error in HTTP 200 as a failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          extract_id: 'extract-test',
          results: [],
          errors: [{ error_type: 'fetch_error', http_status_code: 403, content: 'Access denied' }],
        }),
      ),
    );

    expect(await fetchUrlTool.handler({ url: 'https://example.com' })).toBe(
      'Error: Parallel fetch_error HTTP 403: Access denied',
    );
  });

  it.each([undefined, null, '', '   '])(
    'uses excerpts when full content is missing or empty: %s',
    async (content) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            extract_id: 'extract-test',
            results: [
              { full_content: content, excerpts: ['First excerpt', '', '   ', 'Second excerpt'] },
            ],
            errors: [],
          }),
        ),
      );

      expect(await fetchUrlTool.handler({ url: 'https://example.com' })).toBe(
        'First excerpt\n\nSecond excerpt',
      );
    },
  );

  it.each([{ excerpts: [] }, { excerpts: [''] }, { excerpts: ['   '] }])(
    'rejects empty full content and excerpts: $excerpts',
    async ({ excerpts }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            extract_id: 'extract-test',
            results: [{ full_content: '', excerpts }],
            errors: [],
          }),
        ),
      );

      expect(await fetchUrlTool.handler({ url: 'https://example.com' })).toBe(
        'Error: Parallel returned no page content',
      );
    },
  );

  it('propagates malformed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ results: 'invalid' })),
    );

    await expect(fetchUrlTool.handler({ url: 'https://example.com' })).rejects.toThrow();
  });

  it('preserves network errors for the tool execution boundary', async () => {
    const networkError = new TypeError('fetch failed', { cause: new Error('connection refused') });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    await expect(fetchUrlTool.handler({ url: 'https://example.com' })).rejects.toBe(networkError);
  });

  it('aborts an in-flight request when the user cancels', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
          }),
      ),
    );

    const request = fetchUrlTool.handler({ url: 'https://example.com' }, controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports the 80-second request timeout separately from user cancellation', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
          }),
      ),
    );

    const request = fetchUrlTool.handler({ url: 'https://example.com' });
    controller.abort(new DOMException('Timed out', 'TimeoutError'));

    await expect(request).resolves.toBe('Error: Parallel request timed out');
    expect(timeout).toHaveBeenCalledWith(80_000);
  });
});

describe('fetch_url EveryInfra content', () => {
  it.each([
    {
      url: 'http://mp.weixin.qq.com/s?__biz=test&mid=1&idx=1&sn=signature#section',
      expectedUrl: 'http://mp.weixin.qq.com/s?__biz=test&mid=1&idx=1&sn=signature',
      platform: 'wechat_oa',
      action: 'article_detail',
      content: { title: 'Article', content_text: 'Full article body' },
    },
    {
      url: 'https://mp.weixin.qq.com/s?src=3&timestamp=123&signature=signed%2Burl',
      expectedUrl: 'https://mp.weixin.qq.com/s?src=3&timestamp=123&signature=signed%2Burl',
      platform: 'wechat_oa',
      action: 'article_detail',
      content: { title: 'Article', content_text: 'Full article body' },
    },
    {
      url: 'https://www.xiaohongshu.com/explore/AbC123?xsec_token=secret%3D#section',
      expectedUrl: 'https://www.xiaohongshu.com/explore/AbC123?xsec_token=secret%3D',
      platform: 'xiaohongshu',
      action: 'note',
      content: { title: 'Note', text: 'Full note body', images: ['https://example.com/image.jpg'] },
    },
    {
      url: 'https://rednote.com/discovery/item/red456?xsec_token=token',
      expectedUrl: 'https://www.xiaohongshu.com/discovery/item/red456?xsec_token=token',
      platform: 'xiaohongshu',
      action: 'note',
      content: { title: 'Note', text: 'Full note body' },
    },
  ])('fetches $platform.$action with the complete URL', async (testCase) => {
    const fetchMock = vi.fn(async () => Response.json({ results: testCase.content }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUrlTool.handler({ url: testCase.url });

    expect(result).toBe(JSON.stringify(testCase.content, null, 2));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.everyinfra.com/api/v1/social',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-everyinfra-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: testCase.platform,
          action: testCase.action,
          params: { url: testCase.expectedUrl },
        }),
        redirect: 'manual',
      }),
    );
  });

  it('resolves an xhslink redirect and keeps its token within the same deadline', async () => {
    const noteUrl = 'https://www.xiaohongshu.com/explore/resolved123?xsec_token=secret';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: noteUrl } }))
      .mockResolvedValueOnce(Response.json({ results: { text: 'resolved note' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await fetchUrlTool.handler({
        url: 'https://xhslink.com/a/short123',
      }),
    ).toBe(JSON.stringify({ text: 'resolved note' }, null, 2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0].href).toBe('https://xhslink.com/a/short123');
    expect(fetchMock.mock.calls[1]?.[1].body).toBe(
      JSON.stringify({ platform: 'xiaohongshu', action: 'note', params: { url: noteUrl } }),
    );
    expect(fetchMock.mock.calls[0]?.[1].signal).toBe(fetchMock.mock.calls[1]?.[1].signal);
  });

  it.each([
    'https://example.com/explore/note123',
    'https://www.xiaohongshu.com.evil.test/explore/note123',
    'https://user:password@www.xiaohongshu.com/explore/note123',
    'https://www.xiaohongshu.com/user/profile/123',
  ])('rejects a share redirect outside supported note URLs: %s', async (location) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await fetchUrlTool.handler({
        url: 'https://xhslink.com/a/short123',
      }),
    ).toMatch(/^Error: Xiaohongshu share URL/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('limits share redirects before making a paid request', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: '/a/another' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await fetchUrlTool.handler({
        url: 'https://xhslink.com/a/short123',
      }),
    ).toBe('Error: Xiaohongshu share URL exceeded 3 redirects');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports a missing key without contacting a provider', async () => {
    vi.stubEnv('EVERYINFRA_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await fetchUrlTool.handler({
        url: 'https://mp.weixin.qq.com/s/article',
      }),
    ).toBe('Error: EVERYINFRA_API_KEY is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports provider failures without retrying or switching providers', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 'invalid_url',
            message: 'Article link cannot be read',
            request_id: 'req-1',
          },
        },
        { status: 422 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await fetchUrlTool.handler({
        url: 'https://mp.weixin.qq.com/s/article',
      }),
    ).toBe('Error: EveryInfra HTTP 422 (invalid_url, Article link cannot be read, req-1)');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports an invalid JSON response with its HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream failed', { status: 502 })),
    );
    expect(
      await fetchUrlTool.handler({
        url: 'https://mp.weixin.qq.com/s/article',
      }),
    ).toBe('Error: EveryInfra HTTP 502 returned invalid JSON');
  });

  it.each([
    { results: null },
    { results: [] },
    { results: {} },
    { results: { title: 'Metadata only' } },
    {},
  ])(
    'does not return a missing or malformed content object as successful text',
    async (payload) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(payload)),
      );
      expect(
        await fetchUrlTool.handler({
          url: 'https://mp.weixin.qq.com/s/article',
        }),
      ).toBe('Error: EveryInfra returned no page content');
    },
  );

  it('keeps article text and metadata without duplicating its HTML body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          results: {
            title: 'Article',
            content_text: 'Complete text',
            content_html: '<p>Complete text</p>',
            account_name: 'Publisher',
          },
        }),
      ),
    );
    expect(
      JSON.parse(
        await fetchUrlTool.handler({
          url: 'https://mp.weixin.qq.com/s/article',
        }),
      ),
    ).toEqual({
      title: 'Article',
      content_text: 'Complete text',
      account_name: 'Publisher',
    });
  });

  it('keeps image-only notes as valid content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ results: { text: '', images: ['https://example.com/image.jpg'] } }),
      ),
    );
    expect(
      JSON.parse(
        await fetchUrlTool.handler({
          url: 'https://www.xiaohongshu.com/explore/note123',
        }),
      ),
    ).toEqual({ text: '', images: ['https://example.com/image.jpg'] });
  });

  it('preserves unexpected network failures for the executor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network failed');
      }),
    );
    await expect(
      fetchUrlTool.handler({
        url: 'https://mp.weixin.qq.com/s/article',
      }),
    ).rejects.toThrow('network failed');
  });

  it('aborts the provider request after 120 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const request = fetchUrlTool.handler({
      url: 'https://mp.weixin.qq.com/s/article',
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await request).toBe('Error: EveryInfra request timed out');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates cancellation and releases its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const request = fetchUrlTool.handler(
      { url: 'https://mp.weixin.qq.com/s/article' },
      controller.signal,
    );
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fetch_url Reddit through Parallel', () => {
  it.each([
    ['https://www.reddit.com/r/typescript/comments/AbC123/title/', 'abc123'],
    ['https://reddit.com/gallery/Gal456', 'gal456'],
    ['https://redd.it/Short789', 'short789'],
  ])('normalizes %s before extracting text with Parallel', async (url, postId) => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        extract_id: 'extract-reddit',
        results: [{ full_content: 'Reddit post and comments', excerpts: [] }],
        errors: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchUrlTool.handler({ url })).toBe('Reddit post and comments');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.parallel.ai/v1/extract',
      expect.objectContaining({
        body: JSON.stringify({
          urls: [`https://www.reddit.com/comments/${postId}/`],
          advanced_settings: {
            full_content: true,
            fetch_policy: {
              max_age_seconds: 600,
              timeout_seconds: 60,
              disable_cache_fallback: true,
            },
          },
        }),
      }),
    );
  });

  it('resolves a share link before using Parallel for its post', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: '/r/test/comments/Resolved123/title/' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          extract_id: 'extract-reddit',
          results: [{ full_content: 'Post body', excerpts: [] }],
          errors: [],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchUrlTool.handler({ url: 'https://www.reddit.com/r/test/s/opaque' })).toBe(
      'Post body',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.parallel.ai/v1/extract');
    expect(fetchMock.mock.calls[1]?.[1].body).toContain(
      'https://www.reddit.com/comments/resolved123/',
    );
  });

  it('rejects a share redirect outside Reddit before calling Parallel', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/comments/post' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchUrlTool.handler({ url: 'https://reddit.com/r/test/s/opaque' })).toBe(
      'Error: Reddit share URL redirected outside Reddit',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('limits share redirect loops before calling Parallel', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: '/r/test/s/again' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchUrlTool.handler({ url: 'https://reddit.com/r/test/s/opaque' })).toBe(
      'Error: Reddit share URL exceeded 3 redirects',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('propagates cancellation while resolving a share URL', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const request = fetchUrlTool.handler(
      { url: 'https://reddit.com/r/test/s/opaque' },
      controller.signal,
    );
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
