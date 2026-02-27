import { describe, expect, it } from 'vitest'
import {
  buildExcerpt,
  buildFtsQuery,
  containsCjk,
  extractSearchText,
} from './conversations-db'

describe('containsCjk', () => {
  it('detects CJK correctly for Chinese and mixed text', () => {
    expect(containsCjk('hello world')).toBe(false)
    expect(containsCjk('你好世界')).toBe(true)
    expect(containsCjk('hello 世界')).toBe(true)
  })
})

describe('buildFtsQuery', () => {
  it('builds AND wildcard query for multi-word input', () => {
    expect(buildFtsQuery('hello world')).toBe('hello* AND world*')
  })

  it('sanitizes special characters', () => {
    expect(buildFtsQuery('hello!!! world?? test@@')).toBe('hello* AND world* AND test*')
  })

  it('returns empty string for empty tokens', () => {
    expect(buildFtsQuery('  !!!  @@  ')).toBe('')
  })
})

describe('extractSearchText', () => {
  it('extracts content and error message blocks only', () => {
    const messages: object[] = [
      {
        role: 'user',
        blocks: [
          { type: 'content', content: 'user question' },
          { type: 'attachments', attachments: [{ id: 'a1' }] },
        ],
      },
      {
        role: 'assistant',
        blocks: [
          { type: 'content', content: 'assistant answer' },
          { type: 'error', message: 'something failed' },
          { type: 'research', items: [{ kind: 'thinking', text: 'ignored' }] },
        ],
      },
    ]

    expect(extractSearchText(messages)).toBe(
      'user question\nassistant answer\nsomething failed',
    )
  })
})

describe('buildExcerpt', () => {
  it('keeps excerpt around hit in middle', () => {
    const text = `${'prefix '.repeat(80)} keyword ${'suffix '.repeat(80)}`
    const excerpt = buildExcerpt(text, 'keyword')

    expect(excerpt.includes('keyword')).toBe(true)
    expect(excerpt.startsWith('...')).toBe(true)
    expect(excerpt.endsWith('...')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(142)
  })

  it('handles hit near beginning without leading ellipsis', () => {
    const text = `keyword ${'tail '.repeat(60)}`
    const excerpt = buildExcerpt(text, 'keyword')

    expect(excerpt.includes('keyword')).toBe(true)
    expect(excerpt.startsWith('...')).toBe(false)
    expect(excerpt.length).toBeLessThanOrEqual(142)
  })

  it('handles hit near the end with trailing content clipped', () => {
    const text = `${'head '.repeat(90)} keyword at end`
    const excerpt = buildExcerpt(text, 'keyword')

    expect(excerpt.includes('keyword')).toBe(true)
    expect(excerpt.startsWith('...')).toBe(true)
    expect(excerpt.endsWith('...')).toBe(false)
    expect(excerpt.length).toBeLessThanOrEqual(142)
  })

  it('falls back to leading text when no hit exists', () => {
    const text = `no-match ${'body '.repeat(80)}`
    const excerpt = buildExcerpt(text, 'keyword')

    expect(excerpt.startsWith('no-match')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(139)
  })
})
