import { describe, expect, it } from 'vitest'
import { truncateTextByWidth } from './preview-text'

describe('truncateTextByWidth', () => {
  it('counts ASCII characters as width 1', () => {
    expect(truncateTextByWidth('abcdefghij', 10, '…')).toBe('abcdefghij')
    expect(truncateTextByWidth('abcdefghijk', 10, '…')).toBe('abcdefghij…')
  })

  it('counts Chinese characters as width 2', () => {
    expect(truncateTextByWidth('你好世界你', 10, '…')).toBe('你好世界你')
    expect(truncateTextByWidth('你好世界你好', 10, '…')).toBe('你好世界你…')
  })

  it('truncates mixed Chinese and English text by combined width', () => {
    expect(truncateTextByWidth('hello你好', 9, '…')).toBe('hello你好')
    expect(truncateTextByWidth('hello你好世界', 10, '…')).toBe('hello你好…')
  })
})
