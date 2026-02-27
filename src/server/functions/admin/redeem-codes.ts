import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAdminSession } from '@/server/functions/auth/admin'
import { getServerBindings } from '@/server/env'
import {
  createRedeemCode,
  adminListRedeemCodes,
  updateRedeemCodeStatus,
  type RedeemCodeCursor,
} from '@/server/db/prompt-quota-db'

const cursorSchema = z
  .object({
    created_at: z.string(),
    id: z.string(),
  })
  .nullable()

export const adminListRedeemCodesFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      limit: z.number().int().positive().max(100),
      cursor: cursorSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    await requireAdminSession()

    return adminListRedeemCodes(DB, {
      limit: data.limit,
      cursor: data.cursor as RedeemCodeCursor,
    })
  })

const createCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  amount: z.number().int().positive().max(1_000_000),
  expiresAt: z.string().nullable().optional(),
})

export const adminCreateRedeemCodeFn = createServerFn({ method: 'POST' })
  .inputValidator(createCodeSchema)
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    const session = await requireAdminSession()

    const result = await createRedeemCode(DB, {
      code: data.code,
      amount: data.amount,
      expiresAt: data.expiresAt ?? null,
      createdByUserId: session.user.id,
    })

    if (!result.ok) {
      const message =
        result.reason === 'duplicate_code'
          ? '兑换码已存在'
          : result.message ?? '创建失败'
      throw new Error(message)
    }

    return { id: result.id }
  })

export const adminDeactivateRedeemCodeFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { DB } = getServerBindings()
    await requireAdminSession()

    const result = await updateRedeemCodeStatus(DB, data.id, false)

    if (!result.ok) {
      const message =
        result.reason === 'not_found' ? '兑换码不存在或已使用' : result.message ?? '操作失败'
      throw new Error(message)
    }

    return { ok: true }
  })
