import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverEnv = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

vi.mock('@/backend/platform/cloudflare/env', () => serverEnv);

import { getAvailableModels, refreshAvailableModels } from './available-models';

const cacheMatch = vi.fn(async (_key: string): Promise<Response | undefined> => undefined);
const cachePut = vi.fn(async (_key: string, _response: Response) => undefined);
const cacheOpen = vi.fn(async (_name: string) => ({ match: cacheMatch, put: cachePut }));

beforeEach(() => {
  serverEnv.getServerEnv.mockReset();
  cacheMatch.mockReset();
  cacheMatch.mockResolvedValue(undefined);
  cachePut.mockReset();
  cachePut.mockResolvedValue(undefined);
  cacheOpen.mockClear();
  vi.unstubAllGlobals();
  vi.stubGlobal('caches', { open: cacheOpen });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('available model cache', () => {
  it('returns a valid cached model list without fetching providers', async () => {
    const cachedModels = [{ id: 'cached:model', name: 'Cached model' }];
    cacheMatch.mockResolvedValue(new Response(JSON.stringify(cachedModels)));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAvailableModels()).resolves.toEqual(cachedModels);

    expect(cacheMatch).toHaveBeenCalledWith('https://aether-model-list.invalid/v1');
    expect(serverEnv.getServerEnv).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cachePut).not.toHaveBeenCalled();
  });

  it('refreshes providers without reading the existing cache and overwrites it', async () => {
    serverEnv.getServerEnv.mockReturnValue({ MOONSHOT_API_KEY: 'moonshot-key' });
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: 'moonshot-v1-8k', name: 'Moonshot v1 8K' }] })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshAvailableModels()).resolves.toEqual([
      { id: 'claudeOpus46Ikun', name: 'opus-4-6+ikun' },
      { id: 'moonshot:moonshot-v1-8k', name: 'Moonshot v1 8K+moonshot' },
    ]);

    expect(cacheMatch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('https://api.moonshot.cn/v1/models', {
      headers: { Authorization: 'Bearer moonshot-key' },
    });
    expect(cachePut).toHaveBeenCalledOnce();
    expect(cachePut).toHaveBeenCalledWith(
      'https://aether-model-list.invalid/v1',
      expect.any(Response),
    );

    const cachedResponse = cachePut.mock.calls[0]?.[1];
    if (!cachedResponse) throw new Error('Model cache response was not written');
    expect(cachedResponse.headers.get('Cache-Control')).toBe('public, max-age=86400');
    await expect(cachedResponse.json()).resolves.toEqual([
      { id: 'claudeOpus46Ikun', name: 'opus-4-6+ikun' },
      { id: 'moonshot:moonshot-v1-8k', name: 'Moonshot v1 8K+moonshot' },
    ]);
  });

  it('refreshes and fills the cache after a cache miss', async () => {
    serverEnv.getServerEnv.mockReturnValue({});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAvailableModels()).resolves.toEqual([
      { id: 'claudeOpus46Ikun', name: 'opus-4-6+ikun' },
    ]);

    expect(cacheOpen).toHaveBeenCalledTimes(2);
    expect(cacheMatch).toHaveBeenCalledOnce();
    expect(serverEnv.getServerEnv).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cachePut).toHaveBeenCalledOnce();
  });

  it('keeps the current cache untouched when a provider refresh fails', async () => {
    serverEnv.getServerEnv.mockReturnValue({ MOONSHOT_API_KEY: 'moonshot-key' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 502 })),
    );

    await expect(refreshAvailableModels()).rejects.toThrow(
      'moonshot model list request failed: 502',
    );

    expect(cacheMatch).not.toHaveBeenCalled();
    expect(cachePut).not.toHaveBeenCalled();
  });
});
