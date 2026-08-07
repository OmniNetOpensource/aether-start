import { createServerFn } from '@tanstack/solid-start';
import { redeemInputSchema } from '@/schema/quota';

export const getQuotaFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ getServerBindings }, { requireSession }, { getOrCreateUserQuota }] = await Promise.all([
    import('@/backend/platform/cloudflare/env'),
    import('@/backend/auth/request'),
    import('@/backend/quota/prompt-quota-db'),
  ]);
  const { DB } = getServerBindings();
  const session = await requireSession();

  const quota = await getOrCreateUserQuota(DB, session.user.id);
  return { balance: quota.balance };
});

export const redeemCodeFn = createServerFn({ method: 'POST' })
  .validator(redeemInputSchema)
  .handler(async ({ data }) => {
    const [
      { getServerBindings },
      { requireSession },
      { getOrCreateUserQuota, redeemSingleUseCode },
    ] = await Promise.all([
      import('@/backend/platform/cloudflare/env'),
      import('@/backend/auth/request'),
      import('@/backend/quota/prompt-quota-db'),
    ]);
    const { DB } = getServerBindings();
    const session = await requireSession();

    const result = await redeemSingleUseCode(DB, session.user.id, data.code);

    if (!result.ok) {
      const message =
        result.reason === 'invalid_code'
          ? '兑换码无效'
          : result.reason === 'already_used'
            ? '兑换码已被使用'
            : result.reason === 'expired'
              ? '兑换码已过期'
              : result.reason === 'inactive'
                ? '兑换码已停用'
                : (result.message ?? '兑换失败');
      throw new Error(message);
    }

    const quota = await getOrCreateUserQuota(DB, session.user.id);
    return { added: result.added, balance: quota.balance };
  });
