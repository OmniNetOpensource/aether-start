import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getServerEnvMock } = vi.hoisted(() => ({
  getServerEnvMock: vi.fn(),
}))

vi.mock('@/server/env', () => ({
  getServerEnv: getServerEnvMock,
}))

import {
  logProviderCommunication,
  shouldLogProviderCommunication,
} from './logger'

describe('provider stream logging', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

  beforeEach(() => {
    getServerEnvMock.mockReset()
    getServerEnvMock.mockReturnValue({})
    consoleLogSpy.mockClear()
  })

  it('stays disabled by default', () => {
    expect(shouldLogProviderCommunication('openai')).toBe(false)

    logProviderCommunication('openai', 'Stream chunk', { chunk: 'hello' })

    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('supports enabling specific providers only', () => {
    getServerEnvMock.mockReturnValue({
      LLM_STREAM_LOGGING: 'anthropic, openai_responses',
    })

    expect(shouldLogProviderCommunication('anthropic')).toBe(true)
    expect(shouldLogProviderCommunication('openai-responses')).toBe(true)
    expect(shouldLogProviderCommunication('openai')).toBe(false)
    expect(shouldLogProviderCommunication('gemini')).toBe(false)
  })

  it('skips log when serialized output exceeds max chars', () => {
    getServerEnvMock.mockReturnValue({
      LLM_STREAM_LOGGING: 'true',
      LLM_STREAM_LOGGING_MAX_CHARS: '50',
    })

    logProviderCommunication('openai', 'Stream chunk', {
      chunk: 'x'.repeat(100),
    })

    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('redacts sensitive fields before printing logs', () => {
    getServerEnvMock.mockReturnValue({
      LLM_STREAM_LOGGING: 'true',
    })

    logProviderCommunication('openai', 'HTTP Request', {
      headers: {
        authorization: 'Bearer secret-token',
        'x-api-key': 'abc123',
        accept: 'text/event-stream',
      },
      nested: {
        apiKey: 'another-secret',
      },
    })

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)

    const [serialized] = consoleLogSpy.mock.calls[0] ?? []
    const entry = JSON.parse(String(serialized)) as {
      data?: {
        headers?: Record<string, string>
        nested?: Record<string, string>
      }
    }

    expect(entry.data?.headers?.authorization).toBe('[REDACTED]')
    expect(entry.data?.headers?.['x-api-key']).toBe('[REDACTED]')
    expect(entry.data?.headers?.accept).toBe('text/event-stream')
    expect(entry.data?.nested?.apiKey).toBe('[REDACTED]')
  })
})
