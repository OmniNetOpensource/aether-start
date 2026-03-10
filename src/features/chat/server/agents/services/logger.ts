import { getServerEnv } from '@/server/env'

const toJsonSafe = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: (value as { cause?: unknown }).cause,
    }
  }

  try {
    JSON.stringify(value)
    return value
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable]'
    }
  }
}

const emitLog = (entry: Record<string, unknown>) => {
  console.log(JSON.stringify(entry))
}

export const log = (category: string, message: string, data?: unknown) => {
  const entry: Record<string, unknown> = {
    ts: Date.now(),
    cat: category,
    msg: message,
  }

  if (data !== undefined) {
    entry.data = toJsonSafe(data)
  }

  emitLog(entry)
}

export type LlmProvider = 'anthropic' | 'openai' | 'openai-responses' | 'gemini'

const LLM_PROVIDER_CATEGORY: Record<LlmProvider, string> = {
  anthropic: 'ANTHROPIC',
  openai: 'OPENAI',
  'openai-responses': 'OPENAI_RESPONSES',
  gemini: 'GEMINI',
}

const ALL_PROVIDER_TOKENS = new Set(['1', 'true', 'yes', 'on', 'all', '*'])
const DISABLED_PROVIDER_TOKENS = new Set(['0', 'false', 'no', 'off'])

const normalizeProviderToken = (value: string): string => {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-')
}

const parseProviderToken = (value: string): LlmProvider | null => {
  const token = normalizeProviderToken(value)

  if (token === 'anthropic' || token === 'openai' || token === 'openai-responses' || token === 'gemini') {
    return token
  }

  if (token === 'openairesponses' || token === 'responses') {
    return 'openai-responses'
  }

  return null
}

const shouldRedactKey = (key: string): boolean => {
  return /authorization|api[-_]?key|token|secret/i.test(key)
}

const redactSensitiveData = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, itemValue]) => [
      key,
      shouldRedactKey(key) ? '[REDACTED]' : redactSensitiveData(itemValue),
    ]),
  )
}

export const shouldLogProviderCommunication = (provider: LlmProvider): boolean => {
  const rawValue = getServerEnv().LLM_STREAM_LOGGING
  if (!rawValue) {
    return false
  }

  const tokens = rawValue
    .split(',')
    .map((item) => normalizeProviderToken(item))
    .filter((item) => item.length > 0)

  if (tokens.length === 0) {
    return false
  }

  if (tokens.some((token) => DISABLED_PROVIDER_TOKENS.has(token))) {
    return false
  }

  if (tokens.some((token) => ALL_PROVIDER_TOKENS.has(token))) {
    return true
  }

  return tokens.some((token) => parseProviderToken(token) === provider)
}

export const logProviderCommunication = (
  provider: LlmProvider,
  message: string,
  data?: unknown,
) => {
  if (!shouldLogProviderCommunication(provider)) {
    return
  }

  log(LLM_PROVIDER_CATEGORY[provider], message, redactSensitiveData(data))
}
