import { createServerFn } from '@tanstack/solid-start';
import {
  createRedeemCodeSchema,
  listRedeemCodesSchema,
  redeemCodeIdSchema,
} from '@/schema/redeem-codes';

export const adminListRedeemCodesFn = createServerFn({ method: 'POST' })
  .validator(listRedeemCodesSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireAdminSession }, { adminListRedeemCodes }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/admin-access'),
        import('@/backend/quota/prompt-quota-db'),
      ]);
    const { DB } = getServerBindings();
    await requireAdminSession();

    return adminListRedeemCodes(DB, {
      limit: data.limit,
      cursor: data.cursor,
    });
  });

export const adminCreateRedeemCodeFn = createServerFn({ method: 'POST' })
  .validator(createRedeemCodeSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireAdminSession }, { createRedeemCode }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/admin-access'),
        import('@/backend/quota/prompt-quota-db'),
      ]);
    const { DB } = getServerBindings();
    const session = await requireAdminSession();

    const result = await createRedeemCode(DB, {
      code: data.code,
      amount: data.amount,
      expiresAt: data.expiresAt ?? null,
      createdByUserId: session.user.id,
    });

    if (!result.ok) {
      const message =
        result.reason === 'duplicate_code' ? '兑换码已存在' : (result.message ?? '创建失败');
      throw new Error(message);
    }

    return { id: result.id };
  });

export const adminDeactivateRedeemCodeFn = createServerFn({ method: 'POST' })
  .validator(redeemCodeIdSchema)
  .handler(async ({ data }) => {
    const [{ getServerBindings }, { requireAdminSession }, { updateRedeemCodeStatus }] =
      await Promise.all([
        import('@/backend/platform/cloudflare/env'),
        import('@/backend/auth/admin-access'),
        import('@/backend/quota/prompt-quota-db'),
      ]);
    const { DB } = getServerBindings();
    await requireAdminSession();

    const result = await updateRedeemCodeStatus(DB, data.id, false);

    if (!result.ok) {
      const message =
        result.reason === 'not_found' ? '兑换码不存在或已使用' : (result.message ?? '操作失败');
      throw new Error(message);
    }

    return { ok: true };
  });
