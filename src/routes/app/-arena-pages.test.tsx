// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArenaRoundView, ArenaSessionView } from '@/types/arena'
import type { ComponentType, ReactNode } from 'react'

const {
  getLatestArenaSessionFnMock,
  createArenaRoundFnMock,
  voteArenaRoundFnMock,
  getArenaLeaderboardFnMock,
  buildAttachmentsFromFilesMock,
} = vi.hoisted(() => ({
  getLatestArenaSessionFnMock: vi.fn(),
  createArenaRoundFnMock: vi.fn(),
  voteArenaRoundFnMock: vi.fn(),
  getArenaLeaderboardFnMock: vi.fn(),
  buildAttachmentsFromFilesMock: vi.fn(),
}))

vi.mock('@/server/functions/arena', () => ({
  getLatestArenaSessionFn: getLatestArenaSessionFnMock,
  createArenaRoundFn: createArenaRoundFnMock,
  voteArenaRoundFn: voteArenaRoundFnMock,
  getArenaLeaderboardFn: getArenaLeaderboardFnMock,
}))

vi.mock('@/lib/chat/attachments', () => ({
  buildAttachmentsFromFiles: buildAttachmentsFromFilesMock,
}))

vi.mock('@/components/Markdown', () => ({
  default: ({ content }: { content: string }) => content,
}))

import { Route as ArenaRoute } from '@/routes/app/arena'
import { Route as LeaderboardRoute } from '@/routes/app/leaderboard'
import { useArenaStore } from '@/stores/useArenaStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ArenaPage = ArenaRoute.options.component as ComponentType
const LeaderboardPage = LeaderboardRoute.options.component as ComponentType

const makeRound = (id: string): ArenaRoundView => ({
  id,
  sessionId: 's1',
  prompt: [{ type: 'content', content: 'hello arena' }],
  responseA: {
    label: 'A',
    blocks: [{ type: 'content', content: 'answer a' }],
  },
  responseB: {
    label: 'B',
    blocks: [{ type: 'content', content: 'answer b' }],
  },
  vote: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
})

const makeSession = (rounds: ArenaRoundView[]): ArenaSessionView => ({
  id: 's1',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  rounds,
})

const renderWithRoot = async (element: ReactNode) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root | null = null

  await act(async () => {
    root = createRoot(container)
    root.render(element)
  })

  return {
    container,
    cleanup: async () => {
      await act(async () => {
        root?.unmount()
      })
      container.remove()
    },
  }
}

describe('arena + leaderboard pages', () => {
  beforeEach(() => {
    getLatestArenaSessionFnMock.mockReset()
    createArenaRoundFnMock.mockReset()
    voteArenaRoundFnMock.mockReset()
    getArenaLeaderboardFnMock.mockReset()
    buildAttachmentsFromFilesMock.mockReset()

    useArenaStore.setState({
      session: null,
      rounds: [],
      loading: false,
      submitting: false,
      votingRoundId: null,
      input: '',
      attachments: [],
      uploading: false,
    })
  })

  it('/app/arena submit shows a round and voting controls', async () => {
    getLatestArenaSessionFnMock.mockResolvedValueOnce(null)

    const round = makeRound('r1')
    createArenaRoundFnMock.mockResolvedValueOnce({
      session: makeSession([round]),
      round,
    })

    const { container, cleanup } = await renderWithRoot(<ArenaPage />)

    await act(async () => {
      useArenaStore.getState().setInput('who is better?')
    })

    const form = container.querySelector('form')
    expect(form).not.toBeNull()

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Response A')
    expect(text).toContain('Response B')
    expect(text).toContain('A 更好')
    expect(text).toContain('B 更好')
    expect(text).toContain('平局')
    expect(text).toContain('都差')

    await cleanup()
  })

  it('/app/leaderboard renders ranking list', async () => {
    getArenaLeaderboardFnMock.mockResolvedValueOnce([
      {
        rank: 1,
        roleId: 'test1',
        name: 'Model One',
        rating: 1032.5,
        matches: 20,
        wins: 12,
        losses: 6,
        draws: 2,
        winRate: 60,
      },
    ])

    const { container, cleanup } = await renderWithRoot(<LeaderboardPage />)

    await act(async () => {
      await Promise.resolve()
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Arena Leaderboard')
    expect(text).toContain('Model One')
    expect(text).toContain('1032.50')
    expect(text).toContain('60.00%')

    await cleanup()
  })
})
