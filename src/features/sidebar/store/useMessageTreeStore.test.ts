import { beforeEach, describe, expect, it } from 'vitest'
import type { ContentBlock, Message } from '@/types/message'
import {
  addMessage,
  createEmptyMessageState,
  createLinearMessages,
} from '@/lib/conversation/tree/message-tree'
import { useMessageTreeStore } from './useMessageTreeStore'

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

describe('useMessageTreeStore', () => {
  beforeEach(() => {
    useMessageTreeStore.setState({
      ...createEmptyMessageState(),
      conversationId: null,
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
})
