import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZodType } from 'zod';

const backend = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getPreferredModelId: vi.fn(),
  savePreferredModelId: vi.fn(),
  database: {},
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (handler: () => Promise<unknown>) => handler,
    inputValidator: (schema: ZodType<{ preferredModelId: string }>) => ({
      handler:
        (handler: (input: { data: { preferredModelId: string } }) => Promise<void>) =>
        (input: { data: unknown }) =>
          handler({ data: schema.parse(input.data) }),
    }),
  }),
}));
vi.mock('@/backend/auth/request', () => ({ requireSession: backend.requireSession }));
vi.mock('@/backend/platform/cloudflare/env', () => ({
  getServerBindings: () => ({ DB: backend.database }),
}));
vi.mock('@/backend/preferences/user-preferences-db', () => ({
  getPreferredModelId: backend.getPreferredModelId,
  savePreferredModelId: backend.savePreferredModelId,
}));
import { getUserPreferencesFn, savePreferredModelFn } from './user-preferences';

beforeEach(() => {
  vi.clearAllMocks();
  backend.requireSession.mockResolvedValue({ user: { id: 'user-a' } });
  backend.getPreferredModelId.mockResolvedValue(null);
  backend.savePreferredModelId.mockResolvedValue(undefined);
});

describe('authenticated model preferences', () => {
  it('reads preferences using the authenticated user and preserves an absent preference', async () => {
    expect(await getUserPreferencesFn()).toEqual({ preferredModelId: null });
    expect(backend.getPreferredModelId).toHaveBeenCalledWith(backend.database, 'user-a');
  });

  it('writes only the current user preference', async () => {
    await savePreferredModelFn({ data: { preferredModelId: 'ikun:gpt-5.4' } });
    backend.requireSession.mockResolvedValue({ user: { id: 'user-b' } });
    await savePreferredModelFn({ data: { preferredModelId: 'ikun:gemini-2.5-pro' } });
    expect(backend.savePreferredModelId.mock.calls).toEqual([
      [backend.database, 'user-a', 'ikun:gpt-5.4'],
      [backend.database, 'user-b', 'ikun:gemini-2.5-pro'],
    ]);
  });

  it('rejects empty model IDs and client-supplied user IDs', async () => {
    for (const data of [
      { preferredModelId: ' ' },
      { preferredModelId: 'model', userId: 'user-b' },
    ]) {
      await expect(async () =>
        Reflect.apply(savePreferredModelFn, undefined, [{ data }]),
      ).rejects.toThrow();
    }
    expect(backend.savePreferredModelId).not.toHaveBeenCalled();
  });

  it('does not access preferences without a session', async () => {
    const unauthorized = new Response('Unauthorized', { status: 401 });
    backend.requireSession.mockRejectedValue(unauthorized);
    await expect(getUserPreferencesFn()).rejects.toBe(unauthorized);
    await expect(savePreferredModelFn({ data: { preferredModelId: 'model' } })).rejects.toBe(
      unauthorized,
    );
    expect(backend.getPreferredModelId).not.toHaveBeenCalled();
    expect(backend.savePreferredModelId).not.toHaveBeenCalled();
  });
});
