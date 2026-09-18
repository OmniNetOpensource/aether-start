import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.unstubAllGlobals();
  requestJustOneApiMock.mockReset();
});

describe('fetch_url markdown routing', () => {
  it('keeps unmatched webpages on Jina Reader', async () => {
    const fetchMock = vi.fn(async () => new Response('reader markdown'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUrlTool.handler({
      url: 'https://example.com/article',
      response_type: 'markdown',
    });

    expect(result).toBe('reader markdown');
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/article',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Token-Budget': '200000',
          'X-Engine': 'browser',
          'X-Timeout': '30',
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
    const fetchMock = vi.fn(async () => new Response('reader markdown'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchUrlTool.handler({ url, response_type: 'markdown' })).toBe('reader markdown');
    expect(requestJustOneApiMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(`https://r.jina.ai/${url}`, expect.any(Object));
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

  it('returns a platform error without falling back to Jina Reader', async () => {
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
