import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@/features/conversation/model/types/message'
import {
  addMessage,
  buildCurrentPath,
  cloneBlocks,
  cloneResearchItem,
  computeMessagesFromPath,
  createEmptyMessageState,
  createLinearMessages,
  editMessage,
  getBranchInfo,
  switchBranch,
} from './message-tree'

const textBlock = (text: string): ContentBlock => ({
  type: 'content',
  content: text,
})

describe('createEmptyMessageState', () => {
  it('returns correct initial state', () => {
    const state = createEmptyMessageState()
    expect(state).toEqual({
      messages: [],
      currentPath: [],
      latestRootId: null,
      nextId: 1,
    })
  })
})

describe('addMessage', () => {
  it('adds a root message to empty state', () => {
    const state = createEmptyMessageState()
    const result = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].id).toBe(1)
    expect(result.messages[0].role).toBe('user')
    expect(result.currentPath).toEqual([1])
    expect(result.latestRootId).toBe(1)
    expect(result.nextId).toBe(2)
  })

  it('adds a child message', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    const result = addMessage(state, 'assistant', [textBlock('hi')], '2024-01-02')

    expect(result.messages).toHaveLength(2)
    expect(result.messages[1].id).toBe(2)
    expect(result.currentPath).toEqual([1, 2])
    expect(result.latestRootId).toBe(1)
    // parent's latestChild should point to new message
    expect(result.messages[0].latestChild).toBe(2)
  })

  it('adds sibling messages with correct links', () => {
    // Build: root user -> assistant1, then switch back and add assistant2 as sibling
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    const afterFirst = addMessage(state, 'assistant', [textBlock('reply1')], '2024-01-02')

    // Go back to user message path to add a sibling assistant
    const parentState = {
      messages: afterFirst.messages,
      currentPath: [1], // only user message in path
      latestRootId: afterFirst.latestRootId,
      nextId: afterFirst.nextId,
    }
    const afterSecond = addMessage(parentState, 'assistant', [textBlock('reply2')], '2024-01-03')

    // sibling links
    expect(afterSecond.messages[1].nextSibling).toBe(3) // assistant1 -> assistant2
    expect(afterSecond.messages[2].prevSibling).toBe(2) // assistant2 <- assistant1
    // parent latestChild updated
    expect(afterSecond.messages[0].latestChild).toBe(3)
  })

  it('adds root-level siblings', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('first')], '2024-01-01')

    // Reset path to empty to add another root
    const rootState = {
      messages: state.messages,
      currentPath: [],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    }
    const result = addMessage(rootState, 'user', [textBlock('second')], '2024-01-02')

    expect(result.latestRootId).toBe(2)
    expect(result.messages[0].nextSibling).toBe(2)
    expect(result.messages[1].prevSibling).toBe(1)
  })
})

describe('buildCurrentPath', () => {
  it('returns empty for null latestRootId', () => {
    expect(buildCurrentPath([], null)).toEqual([])
  })

  it('returns single-element path', () => {
    const state = addMessage(createEmptyMessageState(), 'user', [textBlock('hi')], '2024-01-01')
    const path = buildCurrentPath(state.messages, state.latestRootId)
    expect(path).toEqual([1])
  })

  it('follows latestChild chain', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    state = addMessage(state, 'assistant', [textBlock('hi')], '2024-01-02')
    state = addMessage(state, 'user', [textBlock('how')], '2024-01-03')

    const path = buildCurrentPath(state.messages, state.latestRootId)
    expect(path).toEqual([1, 2, 3])
  })

  it('handles missing message gracefully', () => {
    const path = buildCurrentPath([], 999)
    expect(path).toEqual([])
  })
})

describe('computeMessagesFromPath', () => {
  it('returns empty for empty path', () => {
    expect(computeMessagesFromPath([], [])).toEqual([])
  })

  it('returns messages for valid path', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    state = addMessage(state, 'assistant', [textBlock('hi')], '2024-01-02')

    const result = computeMessagesFromPath(state.messages, [1, 2])
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
  })

  it('filters out invalid IDs', () => {
    const state = addMessage(createEmptyMessageState(), 'user', [textBlock('hi')], '2024-01-01')
    const result = computeMessagesFromPath(state.messages, [1, 999])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })
})

describe('switchBranch', () => {
  it('returns same state for invalid target', () => {
    const state = createEmptyMessageState()
    const result = switchBranch(state, 1, 999)
    expect(result).toBe(state)
  })

  it('switches root-level branch', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('first')], '2024-01-01')
    // Add second root
    const rootState = {
      messages: state.messages,
      currentPath: [],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    }
    state = addMessage(rootState, 'user', [textBlock('second')], '2024-01-02')

    // Switch back to first root (depth=1 means root level)
    const switched = switchBranch(state, 1, 1)
    expect(switched.latestRootId).toBe(1)
    expect(switched.currentPath[0]).toBe(1)
  })

  it('switches child-level branch and follows latestChild', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    state = addMessage(state, 'assistant', [textBlock('reply1')], '2024-01-02')

    // Add sibling assistant
    const parentState = {
      messages: state.messages,
      currentPath: [1],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    }
    state = addMessage(parentState, 'assistant', [textBlock('reply2')], '2024-01-03')

    // Switch to first assistant (depth=2)
    const switched = switchBranch(state, 2, 2)
    expect(switched.currentPath).toEqual([1, 2])
  })
})

describe('getBranchInfo', () => {
  it('returns null for invalid ID', () => {
    expect(getBranchInfo([], 999)).toBeNull()
  })

  it('returns null for single message (no siblings)', () => {
    const state = addMessage(createEmptyMessageState(), 'user', [textBlock('hi')], '2024-01-01')
    expect(getBranchInfo(state.messages, 1)).toBeNull()
  })

  it('returns branch info for siblings', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    state = addMessage(state, 'assistant', [textBlock('reply1')], '2024-01-02')

    const parentState = {
      messages: state.messages,
      currentPath: [1],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    }
    state = addMessage(parentState, 'assistant', [textBlock('reply2')], '2024-01-03')

    const info = getBranchInfo(state.messages, 2)
    expect(info).toEqual({
      currentIndex: 0,
      total: 2,
      siblingIds: [2, 3],
    })

    const info2 = getBranchInfo(state.messages, 3)
    expect(info2).toEqual({
      currentIndex: 1,
      total: 2,
      siblingIds: [2, 3],
    })
  })
})

describe('editMessage', () => {
  it('returns null for invalid ID', () => {
    const state = createEmptyMessageState()
    const result = editMessage(state, 1, 999, [textBlock('edited')])
    expect(result).toBeNull()
  })

  it('creates a new sibling with edited content', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('hello')], '2024-01-01')
    state = addMessage(state, 'assistant', [textBlock('reply')], '2024-01-02')

    const result = editMessage(state, 1, 1, [textBlock('hello edited')])
    expect(result).not.toBeNull()
    expect(result!.messages).toHaveLength(3)
    // New message is a sibling of original
    expect(result!.addedMessage.prevSibling).toBe(1)
    expect(result!.messages[0].nextSibling).toBe(3)
    // Path switches to new branch
    expect(result!.currentPath[0]).toBe(3)
  })

  it('updates sibling links when original had nextSibling', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('first')], '2024-01-01')
    // Add root sibling
    const rootState = {
      messages: state.messages,
      currentPath: [],
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    }
    state = addMessage(rootState, 'user', [textBlock('second')], '2024-01-02')

    // Edit first message (which has nextSibling=2)
    const result = editMessage(state, 1, 1, [textBlock('first edited')])
    expect(result).not.toBeNull()
    // Original's nextSibling should now point to new message
    expect(result!.messages[0].nextSibling).toBe(3)
    // New message's nextSibling should be the old nextSibling
    expect(result!.addedMessage.nextSibling).toBe(2)
    // Old nextSibling's prevSibling should point to new message
    expect(result!.messages[1].prevSibling).toBe(3)
  })
})

describe('createLinearMessages', () => {
  it('returns empty state for empty array', () => {
    const state = createLinearMessages([])
    expect(state).toEqual(createEmptyMessageState())
  })

  it('creates a linear chain of messages', () => {
    const state = createLinearMessages([
      { role: 'user', blocks: [textBlock('hello')], createdAt: '2024-01-01' },
      { role: 'assistant', blocks: [textBlock('hi')], createdAt: '2024-01-02' },
      { role: 'user', blocks: [textBlock('how')], createdAt: '2024-01-03' },
    ])

    expect(state.messages).toHaveLength(3)
    expect(state.currentPath).toEqual([1, 2, 3])
    expect(state.latestRootId).toBe(1)
    expect(state.nextId).toBe(4)

    // latestChild chain: 1->2, 2->3, 3->null
    expect(state.messages[0].latestChild).toBe(2)
    expect(state.messages[1].latestChild).toBe(3)
    expect(state.messages[2].latestChild).toBeNull()

    // No siblings in linear chain
    expect(state.messages[0].prevSibling).toBeNull()
    expect(state.messages[0].nextSibling).toBeNull()
  })
})

describe('cloneBlocks', () => {
  it('deep clones content blocks', () => {
    const blocks: ContentBlock[] = [textBlock('hello')]
    const cloned = cloneBlocks(blocks)
    expect(cloned).toEqual(blocks)
    expect(cloned).not.toBe(blocks)
    expect(cloned[0]).not.toBe(blocks[0])
  })

  it('deep clones research blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'research',
        items: [
          { kind: 'thinking', text: 'hmm' },
          {
            kind: 'tool',
            data: {
              call: { tool: 'search', args: { q: 'test' } },
              progress: [{ stage: 'fetching', message: 'loading' }],
              result: { result: 'done' },
            },
          },
        ],
      },
    ]
    const cloned = cloneBlocks(blocks)
    expect(cloned).toEqual(blocks)
    expect(cloned[0]).not.toBe(blocks[0])
  })

  it('deep clones attachment blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'attachments',
        attachments: [
          { id: '1', kind: 'image', name: 'test.png', size: 100, mimeType: 'image/png', url: '/test' },
        ],
      },
    ]
    const cloned = cloneBlocks(blocks)
    expect(cloned).toEqual(blocks)
    const original = blocks[0] as { type: 'attachments'; attachments: unknown[] }
    const copy = cloned[0] as { type: 'attachments'; attachments: unknown[] }
    expect(copy.attachments[0]).not.toBe(original.attachments[0])
  })
})

describe('cloneResearchItem', () => {
  it('clones thinking item', () => {
    const item = { kind: 'thinking' as const, text: 'hmm' }
    const cloned = cloneResearchItem(item)
    expect(cloned).toEqual(item)
    expect(cloned).not.toBe(item)
  })

  it('clones tool item deeply', () => {
    const item = {
      kind: 'tool' as const,
      data: {
        call: { tool: 'search', args: { q: 'test' } },
        progress: [{ stage: 'fetching', message: 'loading' }],
        result: { result: 'done' },
      },
    }
    const cloned = cloneResearchItem(item)
    expect(cloned).toEqual(item)
    expect(cloned).not.toBe(item)
    if (cloned.kind === 'tool') {
      expect(cloned.data.call.args).not.toBe(item.data.call.args)
      expect(cloned.data.progress![0]).not.toBe(item.data.progress![0])
      expect(cloned.data.result).not.toBe(item.data.result)
    }
  })

  it('handles tool item without progress/result', () => {
    const item = {
      kind: 'tool' as const,
      data: {
        call: { tool: 'fetch', args: {} },
      },
    }
    const cloned = cloneResearchItem(item)
    expect(cloned).toEqual(item)
    if (cloned.kind === 'tool') {
      expect(cloned.data.progress).toBeUndefined()
      expect(cloned.data.result).toBeUndefined()
    }
  })
})
