import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UserContentBlock, AssistantContentBlock } from '@/types/message'

vi.mock('@/server/agents/services/chat-config', () => ({
  ARENA_ROLE_POOL: ['test1', 'test2', 'test3'],
  getRoleConfig: (roleId: string) => ({
    id: roleId,
    name: roleId,
  }),
}))

import {
  calculateEloRatings,
  createArenaRound,
  getArenaLeaderboard,
  getLatestArenaSession,
  voteArenaRoundAndUpdateElo,
} from './arena-db'

const createMockD1 = () => {
  const mockFirst = vi.fn()
  const mockRun = vi.fn()
  const mockAll = vi.fn()
  const mockBatch = vi.fn().mockResolvedValue([])

  const prepare = vi.fn(() => ({
    bind: vi.fn(() => ({
      first: mockFirst,
      run: mockRun,
      all: mockAll,
    })),
  }))

  return {
    prepare,
    batch: mockBatch,
    mockFirst,
    mockRun,
    mockAll,
    mockBatch,
  } as unknown as D1Database & {
    mockFirst: ReturnType<typeof vi.fn>
    mockRun: ReturnType<typeof vi.fn>
    mockAll: ReturnType<typeof vi.fn>
    mockBatch: ReturnType<typeof vi.fn>
  }
}

const promptBlocks: UserContentBlock[] = [{ type: 'content', content: 'hello' }]
const responseBlocks: AssistantContentBlock[] = [{ type: 'content', content: 'world' }]

const makeRoundRow = (overrides?: Partial<Record<string, unknown>>) => ({
  id: 'round-1',
  user_id: 'u1',
  session_id: 's1',
  prompt_json: JSON.stringify(promptBlocks),
  response_a_json: JSON.stringify(responseBlocks),
  response_b_json: JSON.stringify(responseBlocks),
  model_a_role: 'test1',
  model_b_role: 'test2',
  vote_choice: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('arena-db', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getLatestArenaSession returns null when no records', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(undefined)

    const result = await getLatestArenaSession(db, 'u1')
    expect(result).toBeNull()
  })

  it('createArenaRound creates blind responses without model exposure', async () => {
    const db = createMockD1()

    const result = await createArenaRound(db, {
      id: 'round-1',
      userId: 'u1',
      sessionId: 's1',
      prompt: promptBlocks,
      responseA: responseBlocks,
      responseB: responseBlocks,
      modelARole: 'test1',
      modelBRole: 'test2',
    })

    expect(result.vote).toBeNull()
    expect(result.responseA.model).toBeUndefined()
    expect(result.responseB.model).toBeUndefined()
  })

  it('voteArenaRoundAndUpdateElo returns not_found for non-owned round', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(undefined)

    const result = await voteArenaRoundAndUpdateElo(db, {
      userId: 'u1',
      roundId: 'r-missing',
      choice: 'a',
    })

    expect(result).toEqual({ status: 'not_found' })
  })

  it('voteArenaRoundAndUpdateElo rejects repeated vote', async () => {
    const db = createMockD1()
    db.mockFirst.mockResolvedValueOnce(makeRoundRow({ vote_choice: 'a' }))

    const result = await voteArenaRoundAndUpdateElo(db, {
      userId: 'u1',
      roundId: 'round-1',
      choice: 'b',
    })

    expect(result).toEqual({ status: 'already_voted' })
  })

  it('voteArenaRoundAndUpdateElo updates and reveals models', async () => {
    const db = createMockD1()

    db.mockFirst
      .mockResolvedValueOnce(makeRoundRow())
      .mockResolvedValueOnce({
        model_id: 'test1',
        rating: 1000,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        updated_at: '2024-01-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        model_id: 'test2',
        rating: 1000,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        updated_at: '2024-01-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(makeRoundRow({ vote_choice: 'tie' }))

    db.mockRun.mockResolvedValueOnce({ meta: { changes: 1 } })

    const result = await voteArenaRoundAndUpdateElo(db, {
      userId: 'u1',
      roundId: 'round-1',
      choice: 'tie',
    })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.round.vote).toBe('tie')
      expect(result.round.responseA.model?.roleId).toBe('test1')
      expect(result.round.responseB.model?.roleId).toBe('test2')
    }
  })

  it('calculateEloRatings adjusts both sides symmetrically', () => {
    const result = calculateEloRatings({
      ratingA: 1000,
      ratingB: 1000,
      scoreA: 1,
      scoreB: 0,
      k: 32,
    })

    expect(result.nextA).toBe(1016)
    expect(result.nextB).toBe(984)
  })

  it('getArenaLeaderboard maps ranking and winRate', async () => {
    const db = createMockD1()
    db.mockAll.mockResolvedValueOnce({
      results: [
        {
          model_id: 'test1',
          rating: 1010.123,
          matches: 10,
          wins: 7,
          losses: 2,
          draws: 1,
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ],
    })

    const result = await getArenaLeaderboard(db, { limit: 10 })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      rank: 1,
      roleId: 'test1',
      matches: 10,
      wins: 7,
      losses: 2,
      draws: 1,
      winRate: 70,
    })
  })
})
