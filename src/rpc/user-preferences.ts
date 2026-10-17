import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getUserPreferencesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ getServerBindings }, { requireSession }, { getPreferredModelId }] = await Promise.all([
    import('@/backend/platform/cloudflare/env'),
    import('@/backend/auth/request'),
    import('@/backend/preferences/user-preferences-db'),
  ]);
  const session = await requireSession();
  return {
    preferredModelId: await getPreferredModelId(getServerBindings().DB, session.user.id),
  };
});

export const savePreferredModelFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ preferredModelId: z.string().trim().min(1).max(512) }).strict())
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireSession }, { savePreferredModelId }] = await Promise.all(
      [
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/request'),
        import('@/backend/preferences/user-preferences-db'),
      ],
    );
    const session = await requireSession();
    await savePreferredModelId(getServerBindings().DB, session.user.id, data.preferredModelId);
  });
