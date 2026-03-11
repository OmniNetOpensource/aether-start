import { describe, expect, it } from 'vitest'
import { buildProviderErrorEvent, buildProviderErrorInfo } from './provider-error'

const backendConfig = {
  apiKey: 'secret',
  baseURL: 'https://api.ikuncode.cc/v1',
  defaultHeaders: {},
}

describe('provider-error', () => {
  it('classifies connection failures as retryable network errors', () => {
    const error = Object.assign(new Error('Connection error.'), {
      name: 'APIConnectionError',
      cause: new Error('fetch failed'),
    })

    const info = buildProviderErrorInfo({
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      backendConfig,
      error,
      fallbackMessage: 'fallback',
    })

    expect(info).toMatchObject({
      code: 'network_error',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      backend: 'api.ikuncode.cc/v1',
      retryable: true,
    })
    expect(info.details).toContain('fetch failed')
  })

  it('classifies 429 responses as rate limits', () => {
    const error = {
      name: 'RateLimitError',
      message: 'Too many requests',
      status: 429,
    }

    const info = buildProviderErrorInfo({
      provider: 'openai',
      model: 'gpt-5.4-high',
      backendConfig,
      error,
      fallbackMessage: 'fallback',
    })

    expect(info).toMatchObject({
      code: 'rate_limit',
      status: 429,
      retryable: true,
    })
  })

  it('builds a structured error event with provider metadata', () => {
    const event = buildProviderErrorEvent({
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      backendConfig,
      error: {
        name: 'AuthenticationError',
        message: 'Unauthorized',
        status: 401,
      },
      fallbackMessage: 'fallback',
    })

    expect(event.type).toBe('error')
    if (event.type !== 'error') {
      throw new Error('Expected an error event')
    }

    expect(event).toMatchObject({
      type: 'error',
      error: {
        code: 'authentication_failed',
        provider: 'gemini',
        model: 'gemini-3.1-pro-preview',
        status: 401,
        retryable: false,
      },
    })
    expect(event.message).toContain('Gemini request failed')
  })
})
