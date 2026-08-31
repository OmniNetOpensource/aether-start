import { createServerFn } from '@tanstack/react-start';
import {
  createRedeemCodeSchema,
  listRedeemCodesSchema,
  redeemCodeIdSchema,
} from '@/schema/redeem-codes';

export const adminListRedeemCodesFn = createServerFn({ method: 'POST' })
  .inputValidator(listRedeemCodesSchema)
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
  .inputValidator(createRedeemCodeSchema)
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
      throw new Error(result.reason === 'duplicate_code' ? '兑换码已存在' : '兑换码不能为空');
    }

    return { id: result.id };
  });

export const adminDeactivateRedeemCodeFn = createServerFn({ method: 'POST' })
  .inputValidator(redeemCodeIdSchema)
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
      throw new Error('兑换码不存在或已使用');
    }

    return { ok: true };
  });
