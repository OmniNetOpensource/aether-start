import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./shared/rate-limit', () => ({
  createRateLimitedQueue:
    () =>
    <T>(task: () => Promise<T>): Promise<T> =>
      task(),
}));

vi.mock('./shared/justone-api', () => ({
  JUST_ONE_API_TIMEOUT_MS: 120_000,
  requestJustOneApi: vi.fn(),
}));

import { fetchUrlTool } from './fetch-tool';
import { requestJustOneApi } from './shared/justone-api';

const requestJustOneApiMock = vi.mocked(requestJustOneApi);

beforeEach(() => {
  vi.stubEnv('PARALLEL_API_KEY', 'test-parallel-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  requestJustOneApiMock.mockReset();
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
      response_type: 'markdown',
    });

    expect(result).toBe('# Page body');
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
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
        results: [{ full_content: 'page' }],
        errors: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchUrlTool.handler({ url, response_type: 'markdown' })).toBe('page');
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.parallel.ai/v1/extract',
      expect.objectContaining({ body: expect.stringContaining(JSON.stringify(url)) }),
    );
  });

  it('keeps image mode ahead of platform markdown routing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await fetchUrlTool.handler({
        url: 'https://www.xiaohongshu.com/explore/note123',
        response_type: 'image',
      }),
    ).toBe(
      "Error: response_type 'image' only accepts direct image URLs (e.g. .jpg, .png, .gif, .webp)",
    );
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetch_url Parallel failures and cancellation', () => {
  it('reports a missing key without making a request', async () => {
    vi.stubEnv('PARALLEL_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' }),
    ).toBe('Error: PARALLEL_API_KEY is not set');
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

    expect(
      await fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' }),
    ).toBe(`Error: Parallel HTTP ${status}: Upstream failure (ref_id error-test)`);
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

    expect(
      await fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' }),
    ).toBe('Error: Parallel fetch_error HTTP 403: Access denied');
  });

  it.each([undefined, null, '', '   '])(
    'rejects missing or empty full content: %s',
    async (content) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            extract_id: 'extract-test',
            results: [{ full_content: content, excerpts: ['This is only an excerpt'] }],
            errors: [],
          }),
        ),
      );

      expect(
        await fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' }),
      ).toBe('Error: Parallel returned no page content');
    },
  );

  it('propagates malformed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ results: 'invalid' })),
    );

    await expect(
      fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' }),
    ).rejects.toThrow();
  });

  it('preserves network errors for the tool execution boundary', async () => {
    const networkError = new TypeError('fetch failed', { cause: new Error('connection refused') });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    await expect(
      fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' }),
    ).rejects.toBe(networkError);
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

    const request = fetchUrlTool.handler(
      { url: 'https://example.com', response_type: 'markdown' },
      controller.signal,
    );
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

    const request = fetchUrlTool.handler({ url: 'https://example.com', response_type: 'markdown' });
    controller.abort(new DOMException('Timed out', 'TimeoutError'));

    await expect(request).resolves.toBe('Error: Parallel request timed out');
    expect(timeout).toHaveBeenCalledWith(80_000);
  });
});

describe('fetch_url WeChat articles', () => {
  it('routes an mp.weixin.qq.com article through article detail V1 in TEXT mode', async () => {
    requestJustOneApiMock.mockResolvedValue({ ok: true, data: 'article text' });

    const result = await fetchUrlTool.handler({
      url: 'http://mp.weixin.qq.com/s?__biz=test&mid=1#section',
      response_type: 'markdown',
    });

    expect(result).toBe('article text');
    expect(requestJustOneApiMock).toHaveBeenCalledOnce();
    expect(requestJustOneApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/weixin/get-article-detail/v1',
        method: 'GET',
      }),
      undefined,
      120_000,
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[0].parameters.get('articleUrl')).toBe(
      'http://mp.weixin.qq.com/s?__biz=test&mid=1',
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[0].parameters.get('mode')).toBe('TEXT');
  });

  it('returns a platform error without requesting Parallel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    requestJustOneApiMock.mockResolvedValue({ ok: false, error: 'request failed' });

    expect(
      await fetchUrlTool.handler({
        url: 'https://mp.weixin.qq.com/s/article',
        response_type: 'markdown',
      }),
    ).toBe('Error: request failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetch_url Xiaohongshu and RedNote notes', () => {
  it.each([
    [
      'https://www.xiaohongshu.com/explore/AbC123?xsec_token=secret',
      'https://www.xiaohongshu.com/explore/AbC123?xsec_token=secret',
    ],
    ['https://rednote.com/discovery/item/red456', 'red456'],
  ])('extracts a supported note reference from %s', async (url, noteId) => {
    requestJustOneApiMock.mockResolvedValue({ ok: true, data: { title: 'note' } });

    expect(await fetchUrlTool.handler({ url, response_type: 'markdown' })).toBe(
      '{\n  "title": "note"\n}',
    );
    expect(requestJustOneApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/xiaohongshu/get-note-detail/v1',
        method: 'GET',
      }),
      undefined,
      120_000,
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[0].parameters.get('noteId')).toBe(noteId);
  });

  it('resolves an xhslink URL before fetching its note within one deadline', async () => {
    requestJustOneApiMock
      .mockResolvedValueOnce({
        ok: true,
        data: {
          redirect_url: 'https://www.xiaohongshu.com/explore/resolved123?xsec_token=secret',
        },
      })
      .mockResolvedValueOnce({ ok: true, data: 'resolved note' });

    const result = await fetchUrlTool.handler({
      url: 'https://xhslink.com/a/short123',
      response_type: 'markdown',
    });

    expect(result).toBe('resolved note');
    expect(requestJustOneApiMock).toHaveBeenCalledTimes(2);
    expect(requestJustOneApiMock.mock.calls[0]?.[0].endpoint).toBe(
      '/api/xiaohongshu/share-url-transfer/v1',
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[0].parameters.get('shareUrl')).toBe(
      'https://xhslink.com/a/short123',
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[2]).toBe(120_000);
    expect(requestJustOneApiMock.mock.calls[1]?.[0].endpoint).toBe(
      '/api/xiaohongshu/get-note-detail/v1',
    );
    expect(requestJustOneApiMock.mock.calls[1]?.[0].parameters.get('noteId')).toBe(
      'https://www.xiaohongshu.com/explore/resolved123?xsec_token=secret',
    );
    expect(requestJustOneApiMock.mock.calls[1]?.[2]).toBeGreaterThan(0);
    expect(requestJustOneApiMock.mock.calls[1]?.[2]).toBeLessThanOrEqual(120_000);
  });

  it('rejects an invalid xhslink response without another fetch or a Jina fallback', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    requestJustOneApiMock.mockResolvedValue({
      ok: true,
      data: { redirectUrl: 'https://www.xiaohongshu.com/explore/note123' },
    });

    expect(
      await fetchUrlTool.handler({
        url: 'https://xhslink.com/a/short123',
        response_type: 'markdown',
      }),
    ).toBe('Error: Just One API returned an invalid Xiaohongshu redirect URL');
    expect(requestJustOneApiMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetch_url Reddit posts', () => {
  it.each([
    ['https://www.reddit.com/r/typescript/comments/AbC123/title/', 't3_abc123'],
    ['https://reddit.com/gallery/Gal456', 't3_gal456'],
    ['https://redd.it/Short789', 't3_short789'],
  ])('extracts a Reddit t3 ID from %s', async (url, postId) => {
    requestJustOneApiMock.mockResolvedValue({ ok: true, data: 'reddit post' });

    expect(await fetchUrlTool.handler({ url, response_type: 'markdown' })).toBe('reddit post');
    expect(requestJustOneApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/reddit/get-post-detail/v1',
        method: 'GET',
      }),
      undefined,
      120_000,
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[0].parameters.get('postId')).toBe(postId);
  });

  it('manually resolves a Reddit share URL before fetching the post', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, {
          status: 302,
          headers: { Location: '/r/typescript/comments/Resolved123/title/' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    requestJustOneApiMock.mockResolvedValue({ ok: true, data: { title: 'post' } });

    const result = await fetchUrlTool.handler({
      url: 'https://www.reddit.com/r/typescript/s/opaque-token',
      response_type: 'markdown',
    });

    expect(result).toBe('{\n  "title": "post"\n}');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://www.reddit.com/r/typescript/s/opaque-token',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[0].parameters.get('postId')).toBe(
      't3_resolved123',
    );
    expect(requestJustOneApiMock.mock.calls[0]?.[2]).toBeGreaterThan(0);
    expect(requestJustOneApiMock.mock.calls[0]?.[2]).toBeLessThanOrEqual(120_000);
  });

  it('rejects a Reddit share redirect outside the host allowlist without using Jina', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://example.com/r/test/comments/abc/title' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await fetchUrlTool.handler({
        url: 'https://reddit.com/r/test/s/opaque',
        response_type: 'markdown',
      }),
    ).toBe('Error: Reddit share URL redirected outside Reddit');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
  });

  it('stops after three Reddit share redirects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: '/r/test/s/second' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: '/r/test/s/third' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: '/r/test/s/fourth' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await fetchUrlTool.handler({
        url: 'https://reddit.com/r/test/s/first',
        response_type: 'markdown',
      }),
    ).toBe('Error: Reddit share URL exceeded 3 redirects');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
  });

  it('propagates a caller abort while resolving a Reddit share URL', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = fetchUrlTool.handler(
      {
        url: 'https://reddit.com/r/test/s/opaque',
        response_type: 'markdown',
      },
      controller.signal,
    );
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
  });
});
