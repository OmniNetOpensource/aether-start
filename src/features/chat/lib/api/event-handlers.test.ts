import { describe, expect, it } from 'vitest'
import { enhanceServerErrorMessage } from './event-handlers'

describe('enhanceServerErrorMessage', () => {
  it('formats structured provider errors with metadata', () => {
    const message = enhanceServerErrorMessage('Anthropic request failed', {
      code: 'network_error',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      backend: 'api.ikuncode.cc',
      retryable: true,
      details: 'Connection error. | cause: fetch failed',
    })

    expect(message).toContain('Network connection issue')
    expect(message).toContain('Provider: anthropic')
    expect(message).toContain('Model: claude-opus-4-6')
    expect(message).toContain('Backend: api.ikuncode.cc')
    expect(message).toContain('Retryable: yes')
    expect(message).toContain('Details: Connection error. | cause: fetch failed')
  })

  it('falls back to legacy string matching when structured metadata is missing', () => {
    const message = enhanceServerErrorMessage('Connection error.')

    expect(message).toContain('Network connection issue')
    expect(message).toContain('Possible cause: unstable connection or interrupted request.')
  })
})
