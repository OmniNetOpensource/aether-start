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
  initialMessageTreeSelectionState,
  useMessageTreeStore,
} from './useMessageTreeStore'

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

describe('useMessageTreeStore', () => {
  beforeEach(() => {
    getAvailableModelsFnMock.mockReset()
    getAvailablePromptsFnMock.mockReset()
    localStorage.clear()
    useMessageTreeStore.setState({
      ...createEmptyMessageState(),
      conversationId: null,
      ...initialMessageTreeSelectionState,
    })
  })

  it('initializes tree from message list and builds fallback current path', () => {
    const linear = createLinearMessages([
      { role: 'user', blocks: [textBlock('q')] },
      { role: 'assistant', blocks: [textBlock('a')] },
    ])

    useMessageTreeStore.getState().initializeTree(linear.messages, [])

    expect(useMessageTreeStore.getState()).toMatchObject({
      currentPath: [1, 2],
      latestRootId: 1,
      nextId: 3,
    })
  })

  it('normalizes parentId for messages loaded from older snapshots', () => {
    useMessageTreeStore.getState().initializeTree(
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

    const [root, child] = useMessageTreeStore.getState().messages
    expect(root.parentId).toBeNull()
    expect(child.parentId).toBe(1)
  })

  it('appends streamed text to the latest assistant message', () => {
    const linear = createLinearMessages([
      { role: 'user', blocks: [textBlock('q')] },
      { role: 'assistant', blocks: [textBlock('hello')] },
    ])

    useMessageTreeStore.getState().initializeTree(linear.messages, linear.currentPath)
    useMessageTreeStore.getState().appendToAssistant({
      type: 'content',
      content: ' world',
    })

    const assistant = useMessageTreeStore.getState().messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.blocks).toEqual([{ type: 'content', content: 'hello world' }])
  })

  it('creates an assistant message when appending with no assistant at path end', () => {
    const linear = createLinearMessages([{ role: 'user', blocks: [textBlock('question')] }])
    useMessageTreeStore.getState().initializeTree(linear.messages, linear.currentPath)

    useMessageTreeStore.getState().appendToAssistant({
      type: 'content',
      content: 'answer',
    })

    const state = useMessageTreeStore.getState()
    expect(state.currentPath).toEqual([1, 2])
    expect(state.nextId).toBe(3)
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].blocks).toEqual([{ type: 'content', content: 'answer' }])
  })

  it('returns branch info and navigates sibling branches', () => {
    const messages = buildBranchedMessages()
    useMessageTreeStore.getState().initializeTree(messages, [1, 3])

    const info = useMessageTreeStore.getState().getBranchInfo(3)
    expect(info).toEqual({
      currentIndex: 1,
      total: 2,
      siblingIds: [2, 3],
    })

    useMessageTreeStore.getState().navigateBranch(3, 2, 'prev')
    expect(useMessageTreeStore.getState().currentPath).toEqual([1, 2])
  })

  it('selects a message and rebuilds the active path through its descendants', () => {
    const state = buildNestedBranchedState()
    useMessageTreeStore.getState().initializeTree(state.messages, state.currentPath)

    useMessageTreeStore.getState().selectMessage(2)

    expect(useMessageTreeStore.getState().currentPath).toEqual([1, 2, 3])
    expect(useMessageTreeStore.getState().messages[0].latestChild).toBe(2)
  })

  it('selects a message under another root and updates latestRootId', () => {
    const state = buildMultiRootState()
    useMessageTreeStore.getState().initializeTree(state.messages, state.currentPath)

    useMessageTreeStore.getState().selectMessage(2)

    expect(useMessageTreeStore.getState().currentPath).toEqual([1, 2])
    expect(useMessageTreeStore.getState().latestRootId).toBe(1)
  })

  it('extracts path messages and clears store state', () => {
    const messages = buildBranchedMessages()
    useMessageTreeStore.getState().initializeTree(messages, [1, 3])

    const pathMessages = useMessageTreeStore.getState().getMessagesFromPath()
    expect(pathMessages.map((message) => message.id)).toEqual([1, 3])

    useMessageTreeStore.getState().setConversationId('conv-1')
    useMessageTreeStore.getState().clear()

    expect(useMessageTreeStore.getState()).toMatchObject({
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

    await useMessageTreeStore.getState().loadAvailableRoles()
    await useMessageTreeStore.getState().loadAvailableRoles()

    expect(getAvailableModelsFnMock).toHaveBeenCalledTimes(1)
    expect(useMessageTreeStore.getState()).toMatchObject({
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

    await useMessageTreeStore.getState().loadAvailablePrompts()
    await useMessageTreeStore.getState().loadAvailablePrompts()

    expect(getAvailablePromptsFnMock).toHaveBeenCalledTimes(1)
    expect(useMessageTreeStore.getState()).toMatchObject({
      promptsLoading: false,
      currentPrompt: 'coder',
      availablePrompts: [
        { id: 'aether', name: 'Aether' },
        { id: 'coder', name: 'Coder' },
      ],
    })
  })
})
