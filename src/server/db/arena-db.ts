import { ARENA_ROLE_POOL, getRoleConfig } from '@/server/agents/services/chat-config'
import type {
  ArenaLeaderboardItem,
  ArenaRoundView,
  ArenaSessionView,
  ArenaVoteChoice,
} from '@/types/arena'
import type { AssistantContentBlock, UserContentBlock } from '@/types/message'

type ArenaSessionRecord = {
  user_id: string
  id: string
  created_at: string
  updated_at: string
}

type ArenaRoundRecord = {
  id: string
  user_id: string
  session_id: string
  prompt: UserContentBlock[]
  response_a: AssistantContentBlock[]
  response_b: AssistantContentBlock[]
  model_a_role: string
  model_b_role: string
  vote_choice: ArenaVoteChoice | null
  created_at: string
  updated_at: string
}

type ArenaModelRatingRecord = {
  model_id: string
  rating: number
  matches: number
  wins: number
  losses: number
  draws: number
  updated_at: string
}

export const DEFAULT_ELO_RATING = 1000
export const DEFAULT_ELO_K = 32

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`

const isArenaVoteChoice = (value: unknown): value is ArenaVoteChoice =>
  value === 'a' || value === 'b' || value === 'tie' || value === 'both_bad'

const safeJsonArrayParse = <T>(value: unknown, fallback: T[]): T[] => {
  if (typeof value !== 'string') {
    return fallback
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

const toArenaSessionRecord = (row: unknown): ArenaSessionRecord | null => {
  if (!isRecord(row) || typeof row.user_id !== 'string' || typeof row.id !== 'string') {
    return null
  }

  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt

  return {
    user_id: row.user_id,
    id: row.id,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const toArenaRoundRecord = (row: unknown): ArenaRoundRecord | null => {
  if (
    !isRecord(row) ||
    typeof row.id !== 'string' ||
    typeof row.user_id !== 'string' ||
    typeof row.session_id !== 'string' ||
    typeof row.model_a_role !== 'string' ||
    typeof row.model_b_role !== 'string'
  ) {
    return null
  }

  const voteChoice = isArenaVoteChoice(row.vote_choice) ? row.vote_choice : null
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : createdAt

  return {
    id: row.id,
    user_id: row.user_id,
    session_id: row.session_id,
    prompt: safeJsonArrayParse<UserContentBlock>(row.prompt_json, []),
    response_a: safeJsonArrayParse<AssistantContentBlock>(row.response_a_json, []),
    response_b: safeJsonArrayParse<AssistantContentBlock>(row.response_b_json, []),
    model_a_role: row.model_a_role,
    model_b_role: row.model_b_role,
    vote_choice: voteChoice,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

const toArenaModelRatingRecord = (row: unknown): ArenaModelRatingRecord | null => {
  if (!isRecord(row) || typeof row.model_id !== 'string') {
    return null
  }

  return {
    model_id: row.model_id,
    rating: typeof row.rating === 'number' ? row.rating : DEFAULT_ELO_RATING,
    matches: typeof row.matches === 'number' ? row.matches : 0,
    wins: typeof row.wins === 'number' ? row.wins : 0,
    losses: typeof row.losses === 'number' ? row.losses : 0,
    draws: typeof row.draws === 'number' ? row.draws : 0,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  }
}

const toModelSummary = (roleId: string) => {
  const role = getRoleConfig(roleId)
  return {
    roleId,
    name: role?.name ?? roleId,
  }
}

const toRoundView = (record: ArenaRoundRecord): ArenaRoundView => {
  const revealModel = record.vote_choice !== null

  return {
    id: record.id,
    sessionId: record.session_id,
    prompt: record.prompt,
    responseA: {
      label: 'A',
      blocks: record.response_a,
      ...(revealModel ? { model: toModelSummary(record.model_a_role) } : {}),
    },
    responseB: {
      label: 'B',
      blocks: record.response_b,
      ...(revealModel ? { model: toModelSummary(record.model_b_role) } : {}),
    },
    vote: record.vote_choice,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

const toRoundViewWithReveal = (record: ArenaRoundRecord): ArenaRoundView => ({
  ...toRoundView(record),
  responseA: {
    label: 'A',
    blocks: record.response_a,
    model: toModelSummary(record.model_a_role),
  },
  responseB: {
    label: 'B',
    blocks: record.response_b,
    model: toModelSummary(record.model_b_role),
  },
})

const getSessionById = async (
  db: D1Database,
  input: { userId: string; sessionId: string },
): Promise<ArenaSessionRecord | null> => {
  const row = await db
    .prepare(
      `
      SELECT user_id, id, created_at, updated_at
      FROM arena_sessions
      WHERE user_id = ?1 AND id = ?2
      LIMIT 1
      `,
    )
    .bind(input.userId, input.sessionId)
    .first()

  return toArenaSessionRecord(row)
}

const getRoundsBySessionId = async (
  db: D1Database,
  input: { userId: string; sessionId: string },
): Promise<ArenaRoundRecord[]> => {
  const rows = await db
    .prepare(
      `
      SELECT
        id,
        user_id,
        session_id,
        prompt_json,
        response_a_json,
        response_b_json,
        model_a_role,
        model_b_role,
        vote_choice,
        created_at,
        updated_at
      FROM arena_rounds
      WHERE user_id = ?1 AND session_id = ?2
      ORDER BY created_at ASC, id ASC
      `,
    )
    .bind(input.userId, input.sessionId)
    .all()

  return Array.isArray(rows.results)
    ? rows.results
        .map((row) => toArenaRoundRecord(row))
        .filter((row): row is ArenaRoundRecord => !!row)
    : []
}

const toSessionView = (session: ArenaSessionRecord, rounds: ArenaRoundRecord[]): ArenaSessionView => ({
  id: session.id,
  created_at: session.created_at,
  updated_at: session.updated_at,
  rounds: rounds.map((round) => toRoundView(round)),
})

const ensureModelRatings = async (
  db: D1Database,
  modelIds: string[],
  now: string,
) => {
  if (modelIds.length === 0) {
    return
  }

  await db.batch(
    modelIds.map((modelId) =>
      db
        .prepare(
          `
          INSERT OR IGNORE INTO arena_model_ratings(
            model_id,
            rating,
            matches,
            wins,
            losses,
            draws,
            updated_at
          )
          VALUES (?1, ?2, 0, 0, 0, 0, ?3)
          `,
        )
        .bind(modelId, DEFAULT_ELO_RATING, now),
    ),
  )
}

const getModelRatingById = async (
  db: D1Database,
  modelId: string,
): Promise<ArenaModelRatingRecord | null> => {
  const row = await db
    .prepare(
      `
      SELECT model_id, rating, matches, wins, losses, draws, updated_at
      FROM arena_model_ratings
      WHERE model_id = ?1
      LIMIT 1
      `,
    )
    .bind(modelId)
    .first()

  return toArenaModelRatingRecord(row)
}

export const calculateEloRatings = (input: {
  ratingA: number
  ratingB: number
  scoreA: 0 | 0.5 | 1
  scoreB: 0 | 0.5 | 1
  k?: number
}) => {
  const k = input.k ?? DEFAULT_ELO_K
  const expectedA = 1 / (1 + 10 ** ((input.ratingB - input.ratingA) / 400))
  const expectedB = 1 / (1 + 10 ** ((input.ratingA - input.ratingB) / 400))

  return {
    nextA: input.ratingA + k * (input.scoreA - expectedA),
    nextB: input.ratingB + k * (input.scoreB - expectedB),
  }
}

export const getLatestArenaSession = async (
  db: D1Database,
  userId: string,
): Promise<ArenaSessionView | null> => {
  const row = await db
    .prepare(
      `
      SELECT user_id, id, created_at, updated_at
      FROM arena_sessions
      WHERE user_id = ?1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      `,
    )
    .bind(userId)
    .first()

  const session = toArenaSessionRecord(row)
  if (!session) {
    return null
  }

  const rounds = await getRoundsBySessionId(db, {
    userId,
    sessionId: session.id,
  })

  return toSessionView(session, rounds)
}

export const createArenaSessionIfMissing = async (
  db: D1Database,
  input: { userId: string; sessionId?: string },
): Promise<ArenaSessionRecord> => {
  if (input.sessionId) {
    const existing = await getSessionById(db, {
      userId: input.userId,
      sessionId: input.sessionId,
    })
    if (existing) {
      return existing
    }
  }

  const now = new Date().toISOString()
  const sessionId = input.sessionId || generateId()

  await db
    .prepare(
      `
      INSERT INTO arena_sessions(user_id, id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      `,
    )
    .bind(input.userId, sessionId, now, now)
    .run()

  return {
    user_id: input.userId,
    id: sessionId,
    created_at: now,
    updated_at: now,
  }
}

export const createArenaRound = async (
  db: D1Database,
  input: {
    id?: string
    userId: string
    sessionId: string
    prompt: UserContentBlock[]
    responseA: AssistantContentBlock[]
    responseB: AssistantContentBlock[]
    modelARole: string
    modelBRole: string
  },
): Promise<ArenaRoundView> => {
  const now = new Date().toISOString()
  const roundId = input.id || generateId()

  await db.batch([
    db
      .prepare(
        `
        INSERT INTO arena_rounds(
          id,
          user_id,
          session_id,
          prompt_json,
          response_a_json,
          response_b_json,
          model_a_role,
          model_b_role,
          vote_choice,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10)
        `,
      )
      .bind(
        roundId,
        input.userId,
        input.sessionId,
        JSON.stringify(input.prompt),
        JSON.stringify(input.responseA),
        JSON.stringify(input.responseB),
        input.modelARole,
        input.modelBRole,
        now,
        now,
      ),
    db
      .prepare(
        `
        UPDATE arena_sessions
        SET updated_at = ?1
        WHERE user_id = ?2 AND id = ?3
        `,
      )
      .bind(now, input.userId, input.sessionId),
  ])

  return {
    id: roundId,
    sessionId: input.sessionId,
    prompt: input.prompt,
    responseA: {
      label: 'A',
      blocks: input.responseA,
    },
    responseB: {
      label: 'B',
      blocks: input.responseB,
    },
    vote: null,
    created_at: now,
    updated_at: now,
  }
}

export const voteArenaRoundAndUpdateElo = async (
  db: D1Database,
  input: {
    userId: string
    roundId: string
    choice: ArenaVoteChoice
  },
): Promise<
  | { status: 'not_found' }
  | { status: 'already_voted' }
  | { status: 'ok'; round: ArenaRoundView }
> => {
  const row = await db
    .prepare(
      `
      SELECT
        id,
        user_id,
        session_id,
        prompt_json,
        response_a_json,
        response_b_json,
        model_a_role,
        model_b_role,
        vote_choice,
        created_at,
        updated_at
      FROM arena_rounds
      WHERE id = ?1 AND user_id = ?2
      LIMIT 1
      `,
    )
    .bind(input.roundId, input.userId)
    .first()

  const existingRound = toArenaRoundRecord(row)
  if (!existingRound) {
    return { status: 'not_found' }
  }

  if (existingRound.vote_choice !== null) {
    return { status: 'already_voted' }
  }

  const now = new Date().toISOString()
  const voteUpdate = await db
    .prepare(
      `
      UPDATE arena_rounds
      SET vote_choice = ?1, updated_at = ?2
      WHERE id = ?3 AND user_id = ?4 AND vote_choice IS NULL
      `,
    )
    .bind(input.choice, now, input.roundId, input.userId)
    .run()

  const voteUpdateMeta = voteUpdate.meta as { changes?: number } | undefined
  const voteChanges = typeof voteUpdateMeta?.changes === 'number' ? voteUpdateMeta.changes : 0
  if (voteChanges === 0) {
    return { status: 'already_voted' }
  }

  const scoreA: 0 | 0.5 | 1 =
    input.choice === 'a' ? 1 : input.choice === 'b' ? 0 : 0.5
  const scoreB: 0 | 0.5 | 1 =
    input.choice === 'a' ? 0 : input.choice === 'b' ? 1 : 0.5

  await ensureModelRatings(
    db,
    [existingRound.model_a_role, existingRound.model_b_role],
    now,
  )

  const ratingA = await getModelRatingById(db, existingRound.model_a_role)
  const ratingB = await getModelRatingById(db, existingRound.model_b_role)

  if (ratingA && ratingB) {
    const next = calculateEloRatings({
      ratingA: ratingA.rating,
      ratingB: ratingB.rating,
      scoreA,
      scoreB,
      k: DEFAULT_ELO_K,
    })

    const aWins = input.choice === 'a' ? ratingA.wins + 1 : ratingA.wins
    const aLosses = input.choice === 'b' ? ratingA.losses + 1 : ratingA.losses
    const aDraws = input.choice === 'tie' || input.choice === 'both_bad'
      ? ratingA.draws + 1
      : ratingA.draws

    const bWins = input.choice === 'b' ? ratingB.wins + 1 : ratingB.wins
    const bLosses = input.choice === 'a' ? ratingB.losses + 1 : ratingB.losses
    const bDraws = input.choice === 'tie' || input.choice === 'both_bad'
      ? ratingB.draws + 1
      : ratingB.draws

    await db.batch([
      db
        .prepare(
          `
          UPDATE arena_model_ratings
          SET
            rating = ?1,
            matches = ?2,
            wins = ?3,
            losses = ?4,
            draws = ?5,
            updated_at = ?6
          WHERE model_id = ?7
          `,
        )
        .bind(
          next.nextA,
          ratingA.matches + 1,
          aWins,
          aLosses,
          aDraws,
          now,
          existingRound.model_a_role,
        ),
      db
        .prepare(
          `
          UPDATE arena_model_ratings
          SET
            rating = ?1,
            matches = ?2,
            wins = ?3,
            losses = ?4,
            draws = ?5,
            updated_at = ?6
          WHERE model_id = ?7
          `,
        )
        .bind(
          next.nextB,
          ratingB.matches + 1,
          bWins,
          bLosses,
          bDraws,
          now,
          existingRound.model_b_role,
        ),
    ])
  }

  const votedRow = await db
    .prepare(
      `
      SELECT
        id,
        user_id,
        session_id,
        prompt_json,
        response_a_json,
        response_b_json,
        model_a_role,
        model_b_role,
        vote_choice,
        created_at,
        updated_at
      FROM arena_rounds
      WHERE id = ?1 AND user_id = ?2
      LIMIT 1
      `,
    )
    .bind(input.roundId, input.userId)
    .first()

  const votedRound = toArenaRoundRecord(votedRow)
  if (!votedRound) {
    return { status: 'not_found' }
  }

  return {
    status: 'ok',
    round: toRoundViewWithReveal(votedRound),
  }
}

export const getArenaLeaderboard = async (
  db: D1Database,
  input?: { limit?: number },
): Promise<ArenaLeaderboardItem[]> => {
  const now = new Date().toISOString()
  await ensureModelRatings(db, [...ARENA_ROLE_POOL], now)

  const limit = Math.max(1, Math.min(input?.limit ?? 50, 200))

  const rows = await db
    .prepare(
      `
      SELECT model_id, rating, matches, wins, losses, draws, updated_at
      FROM arena_model_ratings
      ORDER BY rating DESC, matches DESC, model_id ASC
      LIMIT ?1
      `,
    )
    .bind(limit)
    .all()

  const mapped = Array.isArray(rows.results)
    ? rows.results
        .map((row) => toArenaModelRatingRecord(row))
        .filter((row): row is ArenaModelRatingRecord => !!row)
    : []

  return mapped.map((item, index) => {
    const role = getRoleConfig(item.model_id)
    return {
      rank: index + 1,
      roleId: item.model_id,
      name: role?.name ?? item.model_id,
      rating: Number(item.rating.toFixed(2)),
      matches: item.matches,
      wins: item.wins,
      losses: item.losses,
      draws: item.draws,
      winRate: item.matches > 0 ? Number(((item.wins / item.matches) * 100).toFixed(2)) : 0,
    }
  })
}
