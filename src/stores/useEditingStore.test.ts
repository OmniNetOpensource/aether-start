import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/types/message'
import { addMessage, createEmptyMessageState } from '@/lib/conversation/tree/message-tree'
import { useMessageTreeStore } from '@/stores/useMessageTreeStore'

const { startChatRequestMock, warningMock, stopMock, chatRequestState } = vi.hoisted(() => ({
  startChatRequestMock: vi.fn(),
  warningMock: vi.fn(),
  stopMock: vi.fn(),
  chatRequestState: {
    currentRole: 'aether',
    pending: false,
  },
}))

vi.mock('@/lib/chat/api/chat-orchestrator', () => ({
  startChatRequest: startChatRequestMock,
  resumeRunningConversation: vi.fn(),
}))

vi.mock('@/hooks/useToast', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    warning: warningMock,
    error: vi.fn(),
  },
}))

vi.mock('@/stores/useChatRequestStore', () => ({
  useChatRequestStore: {
    getState: () => ({
      currentRole: chatRequestState.currentRole,
      pending: chatRequestState.pending,
      stop: stopMock,
      setCurrentRole: (role: string) => {
        chatRequestState.currentRole = role
      },
    }),
    setState: (partial: Partial<{ currentRole: string; pending: boolean }>) => {
      if (typeof partial.currentRole === 'string') {
        chatRequestState.currentRole = partial.currentRole
      }
      if (typeof partial.pending === 'boolean') {
        chatRequestState.pending = partial.pending
      }
    },
  },
}))

import { useChatRequestStore } from '@/stores/useChatRequestStore'
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
  useMessageTreeStore.getState()._setTreeState(fullState)
}

describe('useEditingStore', () => {
  beforeEach(() => {
    startChatRequestMock.mockReset()
    startChatRequestMock.mockResolvedValue(undefined)
    warningMock.mockReset()
    stopMock.mockReset()
    chatRequestState.currentRole = 'aether'
    chatRequestState.pending = false

    useEditingStore.setState({ editingState: null })
    useMessageTreeStore.setState({
      ...createEmptyMessageState(),
      conversationId: null,
    })
    useChatRequestStore.setState({ pending: false, currentRole: 'aether' })
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
    useChatRequestStore.getState().setCurrentRole('')

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
    expect(requestArg.titleSource.role).toBe('user')
    expect(useMessageTreeStore.getState().currentPath[0]).toBe(3)
  })

  it('retryFromMessage for assistant rewinds path and starts chat request', async () => {
    seedTreeWithUserAndAssistant()

    await useEditingStore.getState().retryFromMessage(2, 2)

    expect(useMessageTreeStore.getState().currentPath).toEqual([1])
    expect(useEditingStore.getState().editingState).toBeNull()
    expect(startChatRequestMock).toHaveBeenCalledTimes(1)
    expect(startChatRequestMock.mock.calls[0][0].messages.map((m: { id: number }) => m.id)).toEqual(
      [1],
    )
  })
})
