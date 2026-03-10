import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const {
  navigateMock,
  getConversationFnMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getConversationFnMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/server/functions/conversations', () => ({
  getConversationFn: getConversationFnMock,
}))

vi.mock('@/lib/chat/api/chat-orchestrator', () => ({
  startChatRequest: vi.fn(),
  resumeRunningConversation: vi.fn(),
  stopActiveChatRequest: vi.fn(),
}))

import { useConversationLoader } from './useConversationLoader'
import { useComposerStore } from '@/stores/zustand/useComposerStore'
import {
  initialChatRequestState,
  useChatRequestStore,
} from '@/stores/zustand/useChatRequestStore'
import { useEditingStore } from '@/stores/zustand/useEditingStore'
import { useMessageTreeStore } from '@/stores/zustand/useMessageTreeStore'

function TestComponent(props: { conversationId?: string }) {
  useConversationLoader(props.conversationId)
  return null
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useConversationLoader', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    getConversationFnMock.mockReset()

    useComposerStore.getState().clear()
    useEditingStore.getState().clear()
    useMessageTreeStore.getState().clear()
    useChatRequestStore.setState(initialChatRequestState)
    const store = useChatRequestStore.getState()
    store.setStatus('done')
    store.setActiveRequestId(null)
    store.setConnectionState('idle')
    store.setCurrentRole('aether')
    store.setAvailableRoles([{ id: 'aether', name: 'Aether' }])
    store.setRolesLoading(false)
  })

  it('loads the conversation without triggering recovery from the loader', async () => {
    getConversationFnMock.mockResolvedValueOnce({
      id: 'conv-1',
      role: 'aether',
      currentPath: [],
      messages: [],
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T00:00:00.000Z',
    })

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<TestComponent conversationId='conv-1' />)
      await flush()
    })

    expect(useMessageTreeStore.getState().conversationId).toBe('conv-1')

    await act(async () => {
      root.unmount()
      await flush()
    })
  })
})
