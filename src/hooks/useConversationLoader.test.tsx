import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const {
  navigateMock,
  getConversationFnMock,
  resumeRunningConversationMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getConversationFnMock: vi.fn(),
  resumeRunningConversationMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/server/functions/conversations', () => ({
  getConversationFn: getConversationFnMock,
}))

vi.mock('@/lib/chat/api/chat-orchestrator', () => ({
  startChatRequest: vi.fn(),
  resumeRunningConversation: resumeRunningConversationMock,
}))

import { useConversationLoader } from './useConversationLoader'
import { useChatRequestStore } from '@/stores/useChatRequestStore'
import { useComposerStore } from '@/stores/useComposerStore'
import { useEditingStore } from '@/stores/useEditingStore'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'

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
    resumeRunningConversationMock.mockReset()

    useComposerStore.getState().clear()
    useEditingStore.getState().clear()
    useMessageTreeStore.getState().clear()
    useChatRequestStore.setState({
      pending: false,
      chatClient: null,
      chatClientConversationId: null,
      activeRequestId: null,
      connectionState: 'idle',
      connectionStateUpdatedAt: 0,
      currentRole: 'aether',
      availableRoles: [{ id: 'aether', name: 'Aether' }],
      rolesLoading: false,
    })
  })

  it('loads the conversation and resumes it without resetting the global cursor in the loader', async () => {
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

    expect(resumeRunningConversationMock).toHaveBeenCalledWith('conv-1')

    await act(async () => {
      root.unmount()
      await flush()
    })
  })
})
