import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '@/server/functions/auth/session'
import { getServerBindings } from '@/server/env'
import { consumePromptQuotaOnAccept } from '@/server/db/prompt-quota-db'
import {
  createArenaRound,
  createArenaSessionIfMissing,
  getArenaLeaderboard,
  getLatestArenaSession,
  voteArenaRoundAndUpdateElo,
} from '@/server/db/arena-db'
import { getArenaRolePoolConfigs } from '@/server/agents/services/chat-config'
import { runArenaRoundForRole } from '@/server/agents/services/arena-runner'
import { buildUserBlocks } from '@/lib/conversation/tree/block-operations'
import type { SerializedMessage } from '@/types/message'

const attachmentSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('image'),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  url: z.string().min(1),
  storageKey: z.string().optional(),
})

const createArenaRoundInputSchema = z.object({
  sessionId: z.string().min(1).optional(),
  promptText: z.string(),
  attachments: z.array(attachmentSchema),
})

const voteArenaRoundInputSchema = z.object({
  roundId: z.string().min(1),
  choice: z.enum(['a', 'b', 'tie', 'both_bad']),
})

const leaderboardInputSchema = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional()

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `arena_${Date.now()}_${Math.random().toString(36).slice(2)}`

const shuffle = <T>(values: T[]): T[] => {
  const copied = [...values]
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copied[i]
    copied[i] = copied[j]
    copied[j] = tmp
  }
  return copied
}

export const getLatestArenaSessionFn = createServerFn({ method: 'GET' }).handler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type is complex; framework infers from handler
  async (): Promise<any> => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    return getLatestArenaSession(DB, session.user.id)
  },
)

export const createArenaRoundFn = createServerFn({ method: 'POST' })
  .inputValidator(createArenaRoundInputSchema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type is complex; framework infers from handler
  .handler(async ({ data }): Promise<any> => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    const promptBlocks = buildUserBlocks(data.promptText, data.attachments)
    if (promptBlocks.length === 0) {
      throw new Error('请输入内容或上传图片')
    }

    const rolePool = getArenaRolePoolConfigs()
    if (rolePool.length < 2) {
      throw new Error('Arena 模型池不足，至少需要 2 个模型')
    }

    const [modelA, modelB] = shuffle(rolePool).slice(0, 2)

    const arenaSession = await createArenaSessionIfMissing(DB, {
      userId: session.user.id,
      sessionId: data.sessionId,
    })

    const roundId = generateId()
    const consumeResult = await consumePromptQuotaOnAccept(DB, session.user.id, roundId)
    if (!consumeResult.ok) {
      if (consumeResult.reason === 'insufficient') {
        throw new Error('额度不足，请使用兑换码获取更多 prompt 额度')
      }
      throw new Error(consumeResult.message)
    }

    const conversationHistory: SerializedMessage[] = [
      {
        role: 'user',
        blocks: promptBlocks,
      },
    ]

    const [responseA, responseB] = await Promise.all([
      runArenaRoundForRole({
        roleId: modelA.id,
        conversationHistory,
      }),
      runArenaRoundForRole({
        roleId: modelB.id,
        conversationHistory,
      }),
    ])

    const round = await createArenaRound(DB, {
      id: roundId,
      userId: session.user.id,
      sessionId: arenaSession.id,
      prompt: promptBlocks,
      responseA,
      responseB,
      modelARole: modelA.id,
      modelBRole: modelB.id,
    })

    const latestSession = await getLatestArenaSession(DB, session.user.id)

    return {
      session: latestSession ?? {
        id: arenaSession.id,
        created_at: arenaSession.created_at,
        updated_at: round.updated_at,
        rounds: [round],
      },
      round,
    }
  })

export const voteArenaRoundFn = createServerFn({ method: 'POST' })
  .inputValidator(voteArenaRoundInputSchema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type is complex; framework infers from handler
  .handler(async ({ data }): Promise<any> => {
    const { DB } = getServerBindings()
    const session = await requireSession()

    const result = await voteArenaRoundAndUpdateElo(DB, {
        userId: session.user.id,
        roundId: data.roundId,
        choice: data.choice,
    })

    if (result.status === 'not_found') {
      throw new Error('对战回合不存在')
    }

    if (result.status === 'already_voted') {
      throw new Error('该回合已投票，不能重复投票')
    }

    const leaderboardTop = await getArenaLeaderboard(DB, { limit: 10 })

    return {
      round: result.round,
      leaderboardTop,
    }
  })

export const getArenaLeaderboardFn = createServerFn({ method: 'POST' })
  .inputValidator(leaderboardInputSchema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type is complex; framework infers from handler
  .handler(async ({ data }): Promise<any> => {
    const { DB } = getServerBindings()
    await requireSession()

    return getArenaLeaderboard(DB, {
      limit: data?.limit,
    })
  })
