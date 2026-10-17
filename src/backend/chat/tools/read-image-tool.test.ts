import { afterEach, describe, expect, it, vi } from 'vitest';
import { readImageTool } from './read-image-tool';

vi.mock('./shared/rate-limit', () => ({
  createRateLimitedQueue:
    () =>
    <T>(task: () => Promise<T>) =>
      task(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('read_image', () => {
  it('returns image bytes and actual MIME type even without a file extension', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/webp; charset=binary' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      JSON.parse(await readImageTool.handler({ url: 'https://example.com/image?id=1' })),
    ).toEqual({
      type: 'image',
      data_url: 'data:image/webp;base64,AQID',
      mime_type: 'image/webp',
      size_bytes: 3,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/image?id=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each(['text/html', 'image/svg+xml', null])(
    'rejects a non-supported image response: %s',
    async (contentType) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('not an image', {
              headers: contentType ? { 'content-type': contentType } : {},
            }),
        ),
      );
      expect(await readImageTool.handler({ url: 'https://example.com/image.png' })).toBe(
        'Error: read_image requires a JPEG, PNG, GIF, or WebP image response',
      );
    },
  );

  it('returns an upstream HTTP failure without a second request', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 404, statusText: 'Not Found' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await readImageTool.handler({ url: 'https://example.com/missing.png' })).toBe(
      'Error: Image HTTP 404 Not Found',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a non-HTTP URL before downloading', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(readImageTool.handler({ url: 'file:///private/image.png' })).rejects.toThrow(
      'HTTP or HTTPS',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates caller cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const request = readImageTool.handler(
      { url: 'https://example.com/image.png' },
      controller.signal,
    );
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
  });

  it('reports its 30 second download deadline', async () => {
    const timeoutController = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Timed out', 'TimeoutError')),
            );
          }),
      ),
    );
    const request = readImageTool.handler({ url: 'https://example.com/image.png' });
    timeoutController.abort();
    expect(await request).toBe('Error: Image request timed out');
    expect(timeout).toHaveBeenCalledWith(30_000);
  });
});
