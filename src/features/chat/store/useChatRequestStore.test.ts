import { beforeEach, describe, expect, it } from 'vitest'

import {
  initialChatRequestState,
  useChatRequestStore,
} from './useChatRequestStore'

describe('useChatRequestStore', () => {
  beforeEach(() => {
    useChatRequestStore.setState(initialChatRequestState)
  })

  it('starts with the expected initial state', () => {
    expect(useChatRequestStore.getState()).toMatchObject({
      status: 'idle',
    })
  })

  it('updates status', () => {
    const store = useChatRequestStore.getState()

    store.setStatus('sending')
    expect(useChatRequestStore.getState().status).toBe('sending')

    store.setStatus('streaming')
    expect(useChatRequestStore.getState().status).toBe('streaming')

    store.setStatus('idle')
    expect(useChatRequestStore.getState().status).toBe('idle')
  })
})
