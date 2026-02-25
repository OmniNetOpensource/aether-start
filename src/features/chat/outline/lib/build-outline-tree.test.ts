import { describe, expect, it } from 'vitest'
import type { Message } from '@/features/chat/types/chat'
import {
  addMessage,
  createEmptyMessageState,
  switchBranch,
} from '@/features/conversation/model/tree/message-tree'
import {
  buildOutlineTree,
  findPathToMessage,
  getPreview,
} from './build-outline-tree'

const textBlock = (content: string) => ({
  type: 'content' as const,
  content,
})

const createUserMessage = (
  id: number,
  overrides: Partial<Message> = {}
): Message =>
  ({
    id,
    role: 'user',
    blocks: [textBlock(`message-${id}`)],
    prevSibling: null,
    nextSibling: null,
    latestChild: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }) as Message

describe('buildOutlineTree', () => {
  it('builds a single chain for linear messages', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('root')], '2024-01-01')
    state = addMessage(state, 'assistant', [textBlock('reply')], '2024-01-02')
    state = addMessage(state, 'user', [textBlock('follow up')], '2024-01-03')

    const outline = buildOutlineTree(state.messages, state.latestRootId)

    expect(outline.roots).toHaveLength(1)
    expect(outline.roots[0].messageId).toBe(1)
    expect(outline.roots[0].siblingIndex).toBe(1)
    expect(outline.roots[0].siblingCount).toBe(1)
    expect(outline.roots[0].children[0].messageId).toBe(2)
    expect(outline.roots[0].children[0].children[0].messageId).toBe(3)
  })

  it('includes sibling branches with correct sibling index/count', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('root')], '2024-01-01') // 1
    state = addMessage(state, 'assistant', [textBlock('branch-a')], '2024-01-02') // 2

    state = addMessage(
      {
        ...state,
        currentPath: [1],
      },
      'assistant',
      [textBlock('branch-b')],
      '2024-01-03'
    ) // 3

    state = switchBranch(state, 2, 2)
    state = addMessage(state, 'user', [textBlock('leaf-a')], '2024-01-04') // 4

    state = switchBranch(state, 2, 3)
    state = addMessage(state, 'user', [textBlock('leaf-b')], '2024-01-05') // 5

    const outline = buildOutlineTree(state.messages, state.latestRootId)
    const root = outline.roots[0]

    expect(root.children.map((node) => node.messageId)).toEqual([2, 3])
    expect(root.children[0].siblingIndex).toBe(1)
    expect(root.children[0].siblingCount).toBe(2)
    expect(root.children[1].siblingIndex).toBe(2)
    expect(root.children[1].siblingCount).toBe(2)
  })

  it('appends orphan roots after preferred root sibling chain', () => {
    const messages: Message[] = [
      createUserMessage(1, { nextSibling: 3 }),
      createUserMessage(2),
      createUserMessage(3, { prevSibling: 1 }),
    ]

    const outline = buildOutlineTree(messages, 3)

    expect(outline.roots.map((node) => node.messageId)).toEqual([1, 3, 2])
  })
})

describe('findPathToMessage', () => {
  it('returns root-to-target path for deep branch nodes', () => {
    let state = createEmptyMessageState()
    state = addMessage(state, 'user', [textBlock('root')], '2024-01-01') // 1
    state = addMessage(state, 'assistant', [textBlock('branch-a')], '2024-01-02') // 2

    state = addMessage(
      {
        ...state,
        currentPath: [1],
      },
      'assistant',
      [textBlock('branch-b')],
      '2024-01-03'
    ) // 3

    state = switchBranch(state, 2, 2)
    state = addMessage(state, 'user', [textBlock('leaf-a')], '2024-01-04') // 4

    state = switchBranch(state, 2, 3)
    state = addMessage(state, 'user', [textBlock('leaf-b')], '2024-01-05') // 5

    const outline = buildOutlineTree(state.messages, state.latestRootId)

    expect(findPathToMessage(outline.parentById, 4)).toEqual([1, 2, 4])
    expect(findPathToMessage(outline.parentById, 1)).toEqual([1])
  })

  it('returns empty array for invalid target', () => {
    const outline = buildOutlineTree([], null)
    expect(findPathToMessage(outline.parentById, 999)).toEqual([])
  })
})

describe('getPreview', () => {
  it('covers content, attachments, research, error and empty fallbacks', () => {
    const contentMessage: Message = {
      id: 1,
      role: 'user',
      blocks: [textBlock('x'.repeat(90))],
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    }

    const attachmentMessage: Message = {
      id: 2,
      role: 'user',
      blocks: [
        {
          type: 'attachments',
          attachments: [
            {
              id: 'a-1',
              kind: 'image',
              name: '1.png',
              size: 100,
              mimeType: 'image/png',
              url: 'https://example.com/1.png',
            },
            {
              id: 'a-2',
              kind: 'image',
              name: '2.png',
              size: 100,
              mimeType: 'image/png',
              url: 'https://example.com/2.png',
            },
          ],
        },
      ],
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    }

    const researchMessage: Message = {
      id: 3,
      role: 'assistant',
      blocks: [
        {
          type: 'research',
          items: [
            {
              kind: 'thinking',
              text: 'thinking',
            },
          ],
        },
      ],
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    }

    const errorMessage: Message = {
      id: 4,
      role: 'assistant',
      blocks: [
        {
          type: 'error',
          message: '网络请求失败',
        },
      ],
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    }

    const emptyMessage: Message = {
      id: 5,
      role: 'assistant',
      blocks: [],
      prevSibling: null,
      nextSibling: null,
      latestChild: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    }

    expect(getPreview(contentMessage)).toBe('x'.repeat(60))
    expect(getPreview(attachmentMessage)).toBe('图片 x2')
    expect(getPreview(researchMessage)).toBe('思考/工具调用')
    expect(getPreview(errorMessage)).toBe('错误: 网络请求失败')
    expect(getPreview(emptyMessage)).toBe('空消息')
  })
})
