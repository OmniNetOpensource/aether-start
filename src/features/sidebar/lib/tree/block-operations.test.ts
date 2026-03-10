import { describe, expect, it } from 'vitest'
import type {
  AssistantContentBlock,
  Attachment,
  ContentBlock,
} from '@/types/message'
import {
  applyAssistantAddition,
  buildUserBlocks,
  collectAttachmentIds,
  extractAttachmentsFromBlocks,
  extractContentFromBlocks,
} from './block-operations'

const textBlock = (text: string): ContentBlock => ({
  type: 'content',
  content: text,
})

const attachment = (id: string): Attachment => ({
  id,
  kind: 'image',
  name: `${id}.png`,
  size: 100,
  mimeType: 'image/png',
  url: `/assets/${id}`,
})

describe('extractContentFromBlocks', () => {
  it('returns empty string for empty blocks', () => {
    expect(extractContentFromBlocks([])).toBe('')
  })

  it('extracts single content block', () => {
    expect(extractContentFromBlocks([textBlock('hello')])).toBe('hello')
  })

  it('joins multiple content blocks', () => {
    const blocks = [textBlock('hello'), textBlock('world')]
    expect(extractContentFromBlocks(blocks)).toBe('hello\n\nworld')
  })

  it('ignores non-content blocks', () => {
    const blocks: ContentBlock[] = [
      textBlock('hello'),
      { type: 'attachments', attachments: [attachment('1')] },
    ]
    expect(extractContentFromBlocks(blocks)).toBe('hello')
  })
})

describe('extractAttachmentsFromBlocks', () => {
  it('returns empty for no attachment blocks', () => {
    expect(extractAttachmentsFromBlocks([textBlock('hi')])).toEqual([])
  })

  it('extracts attachments', () => {
    const blocks: ContentBlock[] = [
      { type: 'attachments', attachments: [attachment('1'), attachment('2')] },
    ]
    const result = extractAttachmentsFromBlocks(blocks)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('1')
    expect(result[1].id).toBe('2')
  })
})

describe('collectAttachmentIds', () => {
  it('returns empty set for no attachments', () => {
    expect(collectAttachmentIds([textBlock('hi')]).size).toBe(0)
  })

  it('collects and deduplicates IDs', () => {
    const blocks: ContentBlock[] = [
      { type: 'attachments', attachments: [attachment('1'), attachment('2')] },
      { type: 'attachments', attachments: [attachment('2'), attachment('3')] },
    ]
    const ids = collectAttachmentIds(blocks)
    expect(ids.size).toBe(3)
    expect(ids.has('1')).toBe(true)
    expect(ids.has('2')).toBe(true)
    expect(ids.has('3')).toBe(true)
  })
})

describe('buildUserBlocks', () => {
  it('returns empty for empty content and no attachments', () => {
    expect(buildUserBlocks('', [])).toEqual([])
    expect(buildUserBlocks('   ', [])).toEqual([])
  })

  it('returns content block for text only', () => {
    const blocks = buildUserBlocks('hello', [])
    expect(blocks).toEqual([{ type: 'content', content: 'hello' }])
  })

  it('returns attachment block for attachments only', () => {
    const a = attachment('1')
    const blocks = buildUserBlocks('', [a])
    expect(blocks).toEqual([{ type: 'attachments', attachments: [a] }])
  })

  it('returns both blocks for content + attachments', () => {
    const a = attachment('1')
    const blocks = buildUserBlocks('hello', [a])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('content')
    expect(blocks[1].type).toBe('attachments')
  })

  it('trims content', () => {
    const blocks = buildUserBlocks('  hello  ', [])
    expect(blocks).toEqual([{ type: 'content', content: 'hello' }])
  })
})

describe('applyAssistantAddition', () => {
  it('appends content to existing content block', () => {
    const blocks: AssistantContentBlock[] = [{ type: 'content', content: 'hello' }]
    const result = applyAssistantAddition(blocks, { type: 'content', content: ' world' })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'content', content: 'hello world' })
  })

  it('creates new content block when last is not content', () => {
    const blocks: AssistantContentBlock[] = [{ type: 'error', message: 'oops' }]
    const result = applyAssistantAddition(blocks, { type: 'content', content: 'hello' })
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ type: 'content', content: 'hello' })
  })

  it('ignores empty content addition', () => {
    const blocks: AssistantContentBlock[] = [{ type: 'content', content: 'hello' }]
    const result = applyAssistantAddition(blocks, { type: 'content', content: '' })
    expect(result).toBe(blocks)
  })

  it('adds thinking to research block', () => {
    const blocks: AssistantContentBlock[] = []
    const result = applyAssistantAddition(blocks, { kind: 'thinking', text: 'hmm' })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('research')
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    expect(research.items).toHaveLength(1)
    expect(research.items[0]).toEqual({ kind: 'thinking', text: 'hmm' })
  })

  it('appends thinking text to existing thinking item', () => {
    const blocks: AssistantContentBlock[] = [
      { type: 'research', items: [{ kind: 'thinking', text: 'first' }] },
    ]
    const result = applyAssistantAddition(blocks, { kind: 'thinking', text: ' second' })
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    expect(research.items[0]).toEqual({ kind: 'thinking', text: 'first second' })
  })

  it('adds tool_call to research block', () => {
    const blocks: AssistantContentBlock[] = []
    const result = applyAssistantAddition(blocks, {
      kind: 'tool',
      data: { call: { tool: 'search', args: { q: 'test' } } },
    })
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    expect(research.items).toHaveLength(1)
    expect(research.items[0].kind).toBe('tool')
  })

  it('adds tool_progress to matching tool', () => {
    const blocks: AssistantContentBlock[] = [
      {
        type: 'research',
        items: [
          { kind: 'tool', data: { call: { tool: 'search', args: {} } } },
        ],
      },
    ]
    const result = applyAssistantAddition(blocks, {
      kind: 'tool_progress',
      tool: 'search',
      stage: 'fetching',
      message: 'loading',
    })
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    const toolItem = research.items[0]
    expect(toolItem.kind).toBe('tool')
    if (toolItem.kind === 'tool') {
      expect(toolItem.data.progress).toHaveLength(1)
      expect(toolItem.data.progress![0].stage).toBe('fetching')
    }
  })

  it('creates tool entry for tool_progress when no matching tool exists', () => {
    const blocks: AssistantContentBlock[] = []
    const result = applyAssistantAddition(blocks, {
      kind: 'tool_progress',
      tool: 'search',
      stage: 'fetching',
      message: 'loading',
    })
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    expect(research.items).toHaveLength(1)
    expect(research.items[0].kind).toBe('tool')
  })

  it('adds tool_result to matching tool', () => {
    const blocks: AssistantContentBlock[] = [
      {
        type: 'research',
        items: [
          { kind: 'tool', data: { call: { tool: 'search', args: {} } } },
        ],
      },
    ]
    const result = applyAssistantAddition(blocks, {
      kind: 'tool_result',
      tool: 'search',
      result: 'found it',
    })
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    const toolItem = research.items[0]
    if (toolItem.kind === 'tool') {
      expect(toolItem.data.result).toEqual({ result: 'found it' })
    }
  })

  it('creates tool entry for tool_result when no matching tool exists', () => {
    const blocks: AssistantContentBlock[] = []
    const result = applyAssistantAddition(blocks, {
      kind: 'tool_result',
      tool: 'search',
      result: 'found it',
    })
    const research = result[0] as Extract<AssistantContentBlock, { type: 'research' }>
    expect(research.items).toHaveLength(1)
    if (research.items[0].kind === 'tool') {
      expect(research.items[0].data.result).toEqual({ result: 'found it' })
    }
  })

  it('adds error block', () => {
    const blocks: AssistantContentBlock[] = []
    const result = applyAssistantAddition(blocks, { type: 'error', message: 'oops' })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'error', message: 'oops' })
  })

  it('adds research block directly', () => {
    const blocks: AssistantContentBlock[] = []
    const result = applyAssistantAddition(blocks, {
      type: 'research',
      items: [{ kind: 'thinking', text: 'hmm' }],
    })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('research')
  })
})
