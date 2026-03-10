import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAvailableRolesFnMock } = vi.hoisted(() => ({
  getAvailableRolesFnMock: vi.fn(),
}))

vi.mock('@/server/functions/chat/roles', () => ({
  getAvailableRolesFn: getAvailableRolesFnMock,
}))

import {
  initialChatRequestState,
  useChatRequestStore,
} from './useChatRequestStore'

describe('useChatRequestStore', () => {
  beforeEach(() => {
    getAvailableRolesFnMock.mockReset()
    localStorage.clear()
    useChatRequestStore.setState(initialChatRequestState)
  })

  it('starts with the expected initial state', () => {
    expect(useChatRequestStore.getState()).toMatchObject({
      status: 'done',
      activeRequestId: null,
      connectionState: 'idle',
      currentRole: '',
      availableRoles: [],
      rolesLoading: false,
    })
  })

  it('updates request state fields', () => {
    const store = useChatRequestStore.getState()

    store.setCurrentRole('role-custom')
    store.setStatus('sending')
    store.setActiveRequestId('req-1')
    store.setConnectionState('connecting')

    expect(useChatRequestStore.getState()).toMatchObject({
      currentRole: 'role-custom',
      status: 'sending',
      activeRequestId: 'req-1',
      connectionState: 'connecting',
    })

    expect(localStorage.getItem('aether_current_role')).toBe('role-custom')
  })

  it('clearRequestState preserves non-request fields', () => {
    const store = useChatRequestStore.getState()

    store.setCurrentRole('aether')
    store.setConnectionState('connected')
    store.setStatus('answering')
    store.setActiveRequestId('req-9')
    store.clearRequestState()

    expect(useChatRequestStore.getState()).toMatchObject({
      currentRole: 'aether',
      connectionState: 'connected',
      status: 'done',
      activeRequestId: null,
    })
  })

  it('loads roles once and restores the stored role when possible', async () => {
    localStorage.setItem('aether_current_role', 'coder')
    getAvailableRolesFnMock.mockResolvedValueOnce([
      { id: 'aether', name: 'Aether' },
      { id: 'coder', name: 'Coder' },
    ])

    await useChatRequestStore.getState().loadAvailableRoles()
    await useChatRequestStore.getState().loadAvailableRoles()

    expect(getAvailableRolesFnMock).toHaveBeenCalledTimes(1)
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
