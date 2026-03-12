import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlock, Message } from '@/types/message'
import {
  addMessage,
  createEmptyMessageState,
  createLinearMessages,
} from '@/lib/conversation/tree/message-tree'

const { getAvailableModelsFnMock, getAvailablePromptsFnMock } = vi.hoisted(() => ({
  getAvailableModelsFnMock: vi.fn(),
  getAvailablePromptsFnMock: vi.fn(),
}))

vi.mock('@/server/functions/chat/models', () => ({
  getAvailableModelsFn: getAvailableModelsFnMock,
  getAvailablePromptsFn: getAvailablePromptsFnMock,
}))

import {
  initialConversationListState,
  initialChatSessionSelectionState,
  useChatSessionStore,
} from './useChatSessionStore'

const textBlock = (content: string): ContentBlock => ({
  type: 'content',
  content,
})

const buildBranchedMessages = (): Message[] => {
  const root = addMessage(createEmptyMessageState(), 'user', [textBlock('q1')], '2024-01-01')
  const firstAssistant = addMessage(root, 'assistant', [textBlock('a1')], '2024-01-02')
  const siblingAssistant = addMessage(
    {
      messages: firstAssistant.messages,
      currentPath: [1],
      latestRootId: firstAssistant.latestRootId,
      nextId: firstAssistant.nextId,
    },
    'assistant',
    [textBlock('a2')],
    '2024-01-03',
  )
  return siblingAssistant.messages
}

const buildNestedBranchedState = () => {
  let state = addMessage(createEmptyMessageState(), 'user', [textBlock('q1')], '2024-01-01')
  state = addMessage(state, 'assistant', [textBlock('a1')], '2024-01-02')
  state = addMessage(state, 'user', [textBlock('follow a1')], '2024-01-03')
  state = addMessage(
    {
      messages: state.messages,
      currentPath: [1],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    },
    'assistant',
    [textBlock('a2')],
    '2024-01-04',
  )
  state = addMessage(state, 'user', [textBlock('follow a2')], '2024-01-05')

  return state
}

const buildMultiRootState = () => {
  let state = addMessage(createEmptyMessageState(), 'user', [textBlock('root1')], '2024-01-01')
  state = addMessage(state, 'assistant', [textBlock('root1 child')], '2024-01-02')
  state = addMessage(
    {
      messages: state.messages,
      currentPath: [],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    },
    'user',
    [textBlock('root2')],
    '2024-01-03',
  )
  state = addMessage(state, 'assistant', [textBlock('root2 child')], '2024-01-04')

  return state
}

describe('useChatSessionStore', () => {
  beforeEach(() => {
    getAvailableModelsFnMock.mockReset()
    getAvailablePromptsFnMock.mockReset()
    localStorage.clear()
    useChatSessionStore.setState({
      ...initialConversationListState,
      conversationId: null,
      ...initialChatSessionSelectionState,
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    })
  })

  it('initializes tree from message list and builds fallback current path', () => {
    const linear = createLinearMessages([
      { role: 'user', blocks: [textBlock('q')] },
      { role: 'assistant', blocks: [textBlock('a')] },
    ])

    useChatSessionStore.getState().initializeTree(linear.messages, [])

    expect(useChatSessionStore.getState()).toMatchObject({
      currentPath: [1, 2],
      latestRootId: 1,
      nextId: 3,
    })
  })

  it('normalizes parentId for messages loaded from older snapshots', () => {
    useChatSessionStore.getState().initializeTree(
      [
        {
          id: 1,
          role: 'user',
          blocks: [textBlock('q')],
          prevSibling: null,
          nextSibling: null,
          latestChild: 2,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          role: 'assistant',
          blocks: [textBlock('a')],
          prevSibling: null,
          nextSibling: null,
          latestChild: null,
          createdAt: '2024-01-01T00:00:01.000Z',
        },
      ] as Message[],
      [1, 2],
    )

    const [root, child] = useChatSessionStore.getState().messages
    expect(root.parentId).toBeNull()
    expect(child.parentId).toBe(1)
  })

  it('appends streamed text to the latest assistant message', () => {
    const linear = createLinearMessages([
      { role: 'user', blocks: [textBlock('q')] },
      { role: 'assistant', blocks: [textBlock('hello')] },
    ])

    useChatSessionStore.getState().initializeTree(linear.messages, linear.currentPath)
    useChatSessionStore.getState().appendToAssistant({
      type: 'content',
      content: ' world',
    })

    const assistant = useChatSessionStore.getState().messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.blocks).toEqual([{ type: 'content', content: 'hello world' }])
  })

  it('creates an assistant message when appending with no assistant at path end', () => {
    const linear = createLinearMessages([{ role: 'user', blocks: [textBlock('question')] }])
    useChatSessionStore.getState().initializeTree(linear.messages, linear.currentPath)

    useChatSessionStore.getState().appendToAssistant({
      type: 'content',
      content: 'answer',
    })

    const state = useChatSessionStore.getState()
    expect(state.currentPath).toEqual([1, 2])
    expect(state.nextId).toBe(3)
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].blocks).toEqual([{ type: 'content', content: 'answer' }])
  })

  it('returns branch info and navigates sibling branches', () => {
    const messages = buildBranchedMessages()
    useChatSessionStore.getState().initializeTree(messages, [1, 3])

    const info = useChatSessionStore.getState().getBranchInfo(3)
    expect(info).toEqual({
      currentIndex: 1,
      total: 2,
      siblingIds: [2, 3],
    })

    useChatSessionStore.getState().navigateBranch(3, 2, 'prev')
    expect(useChatSessionStore.getState().currentPath).toEqual([1, 2])
  })

  it('selects a message and rebuilds the active path through its descendants', () => {
    const state = buildNestedBranchedState()
    useChatSessionStore.getState().initializeTree(state.messages, state.currentPath)

    useChatSessionStore.getState().selectMessage(2)

    expect(useChatSessionStore.getState().currentPath).toEqual([1, 2, 3])
    expect(useChatSessionStore.getState().messages[0].latestChild).toBe(2)
  })

  it('selects a message under another root and updates latestRootId', () => {
    const state = buildMultiRootState()
    useChatSessionStore.getState().initializeTree(state.messages, state.currentPath)

    useChatSessionStore.getState().selectMessage(2)

    expect(useChatSessionStore.getState().currentPath).toEqual([1, 2])
    expect(useChatSessionStore.getState().latestRootId).toBe(1)
  })

  it('extracts path messages and clears store state', () => {
    const messages = buildBranchedMessages()
    useChatSessionStore.getState().initializeTree(messages, [1, 3])

    const pathMessages = useChatSessionStore.getState().getMessagesFromPath()
    expect(pathMessages.map((message) => message.id)).toEqual([1, 3])

    useChatSessionStore.getState().setConversationId('conv-1')
    useChatSessionStore.getState().clearSession()

    expect(useChatSessionStore.getState()).toMatchObject({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
      conversationId: null,
    })
  })

  it('loads roles once and restores the stored role when possible', async () => {
    localStorage.setItem('aether_current_role', 'coder')
    getAvailableModelsFnMock.mockResolvedValueOnce([
      { id: 'aether', name: 'Aether' },
      { id: 'coder', name: 'Coder' },
    ])

    await useChatSessionStore.getState().loadAvailableRoles()
    await useChatSessionStore.getState().loadAvailableRoles()

    expect(getAvailableModelsFnMock).toHaveBeenCalledTimes(1)
    expect(useChatSessionStore.getState()).toMatchObject({
      rolesLoading: false,
      currentRole: 'coder',
      availableRoles: [
        { id: 'aether', name: 'Aether' },
        { id: 'coder', name: 'Coder' },
      ],
    })
  })

  it('loads prompts once and restores the stored prompt when possible', async () => {
    localStorage.setItem('aether_current_prompt', 'coder')
    getAvailablePromptsFnMock.mockResolvedValueOnce([
      { id: 'aether', name: 'Aether' },
      { id: 'coder', name: 'Coder' },
    ])

    await useChatSessionStore.getState().loadAvailablePrompts()
    await useChatSessionStore.getState().loadAvailablePrompts()

    expect(getAvailablePromptsFnMock).toHaveBeenCalledTimes(1)
    expect(useChatSessionStore.getState()).toMatchObject({
      promptsLoading: false,
      currentPrompt: 'coder',
      availablePrompts: [
        { id: 'aether', name: 'Aether' },
        { id: 'coder', name: 'Coder' },
      ],
    })
  })
})
