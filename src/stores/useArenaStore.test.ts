import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArenaRoundView, ArenaSessionView } from '@/types/arena'

const {
  getLatestArenaSessionFnMock,
  createArenaRoundFnMock,
  voteArenaRoundFnMock,
  buildAttachmentsFromFilesMock,
} = vi.hoisted(() => ({
  getLatestArenaSessionFnMock: vi.fn(),
  createArenaRoundFnMock: vi.fn(),
  voteArenaRoundFnMock: vi.fn(),
  buildAttachmentsFromFilesMock: vi.fn(),
}))

vi.mock('@/server/functions/arena', () => ({
  getLatestArenaSessionFn: getLatestArenaSessionFnMock,
  createArenaRoundFn: createArenaRoundFnMock,
  voteArenaRoundFn: voteArenaRoundFnMock,
}))

vi.mock('@/lib/chat/attachments', () => ({
  buildAttachmentsFromFiles: buildAttachmentsFromFilesMock,
}))

import { useArenaStore } from './useArenaStore'

const makeRound = (id: string, vote: ArenaRoundView['vote'] = null): ArenaRoundView => ({
  id,
  sessionId: 's1',
  prompt: [{ type: 'content', content: 'prompt' }],
  responseA: {
    label: 'A',
    blocks: [{ type: 'content', content: 'a' }],
  },
  responseB: {
    label: 'B',
    blocks: [{ type: 'content', content: 'b' }],
  },
  vote,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
})

const makeSession = (rounds: ArenaRoundView[]): ArenaSessionView => ({
  id: 's1',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  rounds,
})

describe('useArenaStore', () => {
  beforeEach(() => {
    getLatestArenaSessionFnMock.mockReset()
    createArenaRoundFnMock.mockReset()
    voteArenaRoundFnMock.mockReset()
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

  it('loadLatestSession hydrates rounds', async () => {
    getLatestArenaSessionFnMock.mockResolvedValueOnce(makeSession([makeRound('r1')]))

    await useArenaStore.getState().loadLatestSession()

    expect(useArenaStore.getState().rounds.map((round) => round.id)).toEqual(['r1'])
    expect(useArenaStore.getState().loading).toBe(false)
  })

  it('submitRound sends prompt and clears composer', async () => {
    useArenaStore.setState({ input: 'hello' })
    createArenaRoundFnMock.mockResolvedValueOnce({
      session: makeSession([makeRound('r2')]),
      round: makeRound('r2'),
    })

    await useArenaStore.getState().submitRound()

    expect(createArenaRoundFnMock).toHaveBeenCalledWith({
      data: {
        sessionId: undefined,
        promptText: 'hello',
        attachments: [],
      },
    })
    expect(useArenaStore.getState().input).toBe('')
    expect(useArenaStore.getState().rounds.map((round) => round.id)).toEqual(['r2'])
  })

  it('voteRound merges updated round and clears voting flag', async () => {
    useArenaStore.setState({
      session: makeSession([makeRound('r1')]),
      rounds: [makeRound('r1')],
    })

    voteArenaRoundFnMock.mockResolvedValueOnce({
      round: {
        ...makeRound('r1', 'a'),
        responseA: {
          ...makeRound('r1').responseA,
          model: { roleId: 'test1', name: 'model-a' },
        },
        responseB: {
          ...makeRound('r1').responseB,
          model: { roleId: 'test2', name: 'model-b' },
        },
      },
      leaderboardTop: [],
    })

    await useArenaStore.getState().voteRound('r1', 'a')

    expect(useArenaStore.getState().rounds[0].vote).toBe('a')
    expect(useArenaStore.getState().rounds[0].responseA.model?.roleId).toBe('test1')
    expect(useArenaStore.getState().votingRoundId).toBeNull()
  })

  it('voteRound resets flag when request fails', async () => {
    useArenaStore.setState({ rounds: [makeRound('r1')] })
    voteArenaRoundFnMock.mockRejectedValueOnce(new Error('boom'))

    await useArenaStore.getState().voteRound('r1', 'b')

    expect(useArenaStore.getState().votingRoundId).toBeNull()
  })

  it('addAttachments appends uploaded attachments', async () => {
    const file = new File(['x'], 'x.png', { type: 'image/png' })
    buildAttachmentsFromFilesMock.mockResolvedValueOnce([
      {
        id: 'att-1',
        kind: 'image',
        name: 'x.png',
        size: 1,
        mimeType: 'image/png',
        url: '/api/assets/x.png',
      },
    ])

    await useArenaStore.getState().addAttachments([file])

    expect(useArenaStore.getState().attachments).toHaveLength(1)
    expect(useArenaStore.getState().uploading).toBe(false)
  })
})
