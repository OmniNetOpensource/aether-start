import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAvailableModelsFnMock, getAvailablePromptsFnMock } = vi.hoisted(() => ({
  getAvailableModelsFnMock: vi.fn(),
  getAvailablePromptsFnMock: vi.fn(),
}))

vi.mock('@/server/functions/chat/models', () => ({
  getAvailableModelsFn: getAvailableModelsFnMock,
  getAvailablePromptsFn: getAvailablePromptsFnMock,
}))

import {
  initialChatRequestState,
  useChatRequestStore,
} from './useChatRequestStore'

describe('useChatRequestStore', () => {
  beforeEach(() => {
    getAvailableModelsFnMock.mockReset()
    getAvailablePromptsFnMock.mockReset()
    localStorage.clear()
    useChatRequestStore.setState(initialChatRequestState)
  })

  it('starts with the expected initial state', () => {
    expect(useChatRequestStore.getState()).toMatchObject({
      requestPhase: 'done',
      activeRequestId: null,
      connectionState: 'idle',
      currentRole: '',
      availableRoles: [],
      rolesLoading: false,
      currentPrompt: '',
      availablePrompts: [],
      promptsLoading: false,
    })
  })

  it('updates request state fields', () => {
    const store = useChatRequestStore.getState()

    store.setCurrentRole('role-custom')
    store.setRequestPhase('sending')
    store.setActiveRequestId('req-1')
    store.setConnectionState('connecting')

    expect(useChatRequestStore.getState()).toMatchObject({
      currentRole: 'role-custom',
      requestPhase: 'sending',
      activeRequestId: 'req-1',
      connectionState: 'connecting',
    })

    expect(localStorage.getItem('aether_current_role')).toBe('role-custom')
  })

  it('clearRequestState preserves non-request fields', () => {
    const store = useChatRequestStore.getState()

    store.setCurrentRole('aether')
    store.setConnectionState('connected')
    store.setRequestPhase('answering')
    store.setActiveRequestId('req-9')
    store.clearRequestState()

    expect(useChatRequestStore.getState()).toMatchObject({
      currentRole: 'aether',
      connectionState: 'connected',
      requestPhase: 'done',
      activeRequestId: null,
    })
  })

  it('loads roles once and restores the stored role when possible', async () => {
    localStorage.setItem('aether_current_role', 'coder')
    getAvailableModelsFnMock.mockResolvedValueOnce([
      { id: 'aether', name: 'Aether' },
      { id: 'coder', name: 'Coder' },
    ])

    await useChatRequestStore.getState().loadAvailableRoles()
    await useChatRequestStore.getState().loadAvailableRoles()

    expect(getAvailableModelsFnMock).toHaveBeenCalledTimes(1)
    expect(useChatRequestStore.getState()).toMatchObject({
      rolesLoading: false,
      currentRole: 'coder',
      availableRoles: [
        { id: 'aether', name: 'Aether' },
        { id: 'coder', name: 'Coder' },
      ],
    })
  })
})
