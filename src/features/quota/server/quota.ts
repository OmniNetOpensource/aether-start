import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/functions/auth/session'
import { getServerBindings } from '@/server/env'
import {
  getOrCreateUserQuota,
  redeemSingleUseCode,
} from '@/server/db/prompt-quota-db'

export const getQuotaFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { DB } = getServerBindings()
  const session = await requireSession()

  const quota = await getOrCreateUserQuota(DB, session.user.id)
  return { balance: quota.balance }
})

const redeemInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
})

export const redeemCodeFn = createServerFn({ method: 'POST' })
  .inputValidator(redeemInputSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    const result = await redeemSingleUseCode(DB, session.user.id, data.code)

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
                : result.message ?? '兑换失败'
      throw new Error(message)
    }

    const quota = await getOrCreateUserQuota(DB, session.user.id)
    return { added: result.added, balance: quota.balance }
  })
