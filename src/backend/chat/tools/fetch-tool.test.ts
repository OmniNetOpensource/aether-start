import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUrlTool } from './fetch-tool';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetch_url markdown', () => {
  it('always fetches webpage content through Jina Reader', async () => {
    const fetchMock = vi.fn(async () => new Response('reader markdown'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUrlTool.handler({
      url: 'https://example.com/article',
      response_type: 'markdown',
    });

    expect(result).toBe('reader markdown');
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
});
