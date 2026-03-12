import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/types/message'
import {
  initialChatRequestState,
  useChatRequestStore,
} from '@/stores/zustand/useChatRequestStore'
import { addMessage, createEmptyMessageState } from '@/lib/conversation/tree/message-tree'
import {
  initialChatSessionSelectionState,
  useChatSessionStore,
} from '@/stores/zustand/useChatSessionStore'

const { startChatRequestMock, stopActiveChatRequestMock, warningMock } = vi.hoisted(() => ({
  startChatRequestMock: vi.fn(),
  stopActiveChatRequestMock: vi.fn(),
  warningMock: vi.fn(),
}))

vi.mock('@/lib/chat/api/chat-orchestrator', () => ({
  startChatRequest: startChatRequestMock,
  resumeRunningConversation: vi.fn(),
  stopActiveChatRequest: stopActiveChatRequestMock,
}))

vi.mock('@/hooks/useToast', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: warningMock,
    error: vi.fn(),
  },
}))

import { useEditingStore } from './useEditingStore'

const attachment = (id: string): Attachment => ({
  id,
  kind: 'image',
  name: `${id}.png`,
  size: 100,
  mimeType: 'image/png',
  url: `https://example.com/${id}.png`,
})

const seedTreeWithUserAndAssistant = () => {
  const userState = addMessage(
    createEmptyMessageState(),
    'user',
    [{ type: 'content', content: 'original content' }],
    '2024-01-01',
  )
  const fullState = addMessage(
    userState,
    'assistant',
    [{ type: 'content', content: 'assistant reply' }],
    '2024-01-02',
  )
  useChatSessionStore.getState().setTreeState(fullState)
}

describe('useEditingStore', () => {
  beforeEach(() => {
    startChatRequestMock.mockReset()
    startChatRequestMock.mockResolvedValue(undefined)
    stopActiveChatRequestMock.mockReset()
    warningMock.mockReset()

    useEditingStore.setState({ editingState: null })
    useChatSessionStore.setState({
      ...createEmptyMessageState(),
      conversationId: null,
      ...initialChatSessionSelectionState,
    })
    useChatRequestStore.setState(initialChatRequestState)
    const store = useChatRequestStore.getState()
    store.setRequestPhase('done')
    store.setConnectionState('idle')
    useChatSessionStore.getState().setCurrentRole('aether')
    useChatSessionStore.getState().setAvailableRoles([])
    useChatSessionStore.getState().setRolesLoading(false)
  })

  it('starts and cancels editing for a user message', () => {
    seedTreeWithUserAndAssistant()

    useEditingStore.getState().startEditing(1)
    expect(useEditingStore.getState().editingState).toMatchObject({
      messageId: 1,
      editedContent: 'original content',
      editedAttachments: [],
    })

    useEditingStore.getState().cancelEditing()
    expect(useEditingStore.getState().editingState).toBeNull()
  })

  it('does not start editing for non-user messages', () => {
    seedTreeWithUserAndAssistant()

    useEditingStore.getState().startEditing(2)
    expect(useEditingStore.getState().editingState).toBeNull()
  })

  it('updates edited content and attachments', () => {
    seedTreeWithUserAndAssistant()
    useEditingStore.getState().startEditing(1)

    useEditingStore.getState().updateEditContent('changed content')
    useEditingStore.getState().updateEditAttachments([attachment('att-1')])

    expect(useEditingStore.getState().editingState).toMatchObject({
      editedContent: 'changed content',
      editedAttachments: [attachment('att-1')],
    })
  })

  it('submitEdit warns when role is missing', async () => {
    seedTreeWithUserAndAssistant()
    useEditingStore.getState().startEditing(1)
    useChatSessionStore.getState().setCurrentRole('')

    await useEditingStore.getState().submitEdit(1)

    expect(warningMock).toHaveBeenCalledWith('请先选择角色')
    expect(startChatRequestMock).not.toHaveBeenCalled()
    expect(useEditingStore.getState().editingState).not.toBeNull()
  })

  it('submitEdit updates tree and starts chat request', async () => {
    seedTreeWithUserAndAssistant()
    useEditingStore.getState().startEditing(1)
    useEditingStore.getState().updateEditContent('edited user message')

    await useEditingStore.getState().submitEdit(1)

    expect(useEditingStore.getState().editingState).toBeNull()
    expect(startChatRequestMock).toHaveBeenCalledTimes(1)

    const requestArg = startChatRequestMock.mock.calls[0][0]
    expect(requestArg.messages).toHaveLength(1)
    expect(requestArg.messages[0].role).toBe('user')
    expect(useChatSessionStore.getState().currentPath[0]).toBe(3)
  })

  it('retryFromMessage for assistant rewinds path and starts chat request', async () => {
    seedTreeWithUserAndAssistant()

    await useEditingStore.getState().retryFromMessage(2, 2)

    expect(useChatSessionStore.getState().currentPath).toEqual([1])
    expect(useEditingStore.getState().editingState).toBeNull()
    expect(startChatRequestMock).toHaveBeenCalledTimes(1)
    expect(startChatRequestMock.mock.calls[0][0].messages.map((m: { id: number }) => m.id)).toEqual(
      [1],
    )
  })
})
