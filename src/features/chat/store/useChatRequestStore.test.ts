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
      requestPhase: 'done',
      activeRequestId: null,
      connectionState: 'idle',
    })
  })

  it('updates request state fields', () => {
    const store = useChatRequestStore.getState()

    store.setRequestPhase('sending')
    store.setActiveRequestId('req-1')
    store.setConnectionState('connecting')

    expect(useChatRequestStore.getState()).toMatchObject({
      requestPhase: 'sending',
      activeRequestId: 'req-1',
      connectionState: 'connecting',
    })
  })

  it('clearRequestState resets only the request lifecycle', () => {
    const store = useChatRequestStore.getState()

    store.setConnectionState('connected')
    store.setRequestPhase('answering')
    store.setActiveRequestId('req-9')
    store.clearRequestState()

    expect(useChatRequestStore.getState()).toMatchObject({
      connectionState: 'connected',
      requestPhase: 'done',
      activeRequestId: null,
    })
  })
})
