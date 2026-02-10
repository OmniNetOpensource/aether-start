import { env as workerEnv } from 'cloudflare:workers'

type ServerEnv = {
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_BASE_URL?: string
  JINA_API_KEY?: string
  SERP_API_KEY?: string
  SUPADATA_API_KEY?: string
  DB?: D1Database
  CHAT_ASSETS?: R2Bucket
  NODE_ENV?: string
}

const readStringFromProcess = (key: string): string | undefined => {
  if (typeof process === 'undefined' || !process.env) {
    return undefined
  }

  const value = process.env[key]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const getServerEnv = (): ServerEnv => {
  const bindings = workerEnv as Partial<ServerEnv>

  return {
    ANTHROPIC_API_KEY:
      readString(bindings.ANTHROPIC_API_KEY) ??
      readStringFromProcess('ANTHROPIC_API_KEY'),
    ANTHROPIC_BASE_URL:
      readString(bindings.ANTHROPIC_BASE_URL) ??
      readStringFromProcess('ANTHROPIC_BASE_URL'),
    JINA_API_KEY:
      readString(bindings.JINA_API_KEY) ?? readStringFromProcess('JINA_API_KEY'),
    SERP_API_KEY:
      readString(bindings.SERP_API_KEY) ?? readStringFromProcess('SERP_API_KEY'),
    SUPADATA_API_KEY:
      readString(bindings.SUPADATA_API_KEY) ??
      readStringFromProcess('SUPADATA_API_KEY'),
    NODE_ENV:
      readString(bindings.NODE_ENV) ??
      readStringFromProcess('NODE_ENV') ??
      'production',
    DB: bindings.DB,
    CHAT_ASSETS: bindings.CHAT_ASSETS,
  }
}

const requireBinding = <T>(value: T | undefined, bindingName: string): T => {
  if (!value) {
    throw new Error(`Missing worker binding: ${bindingName}`)
  }
  return value
}

export const getServerBindings = () => {
  const env = getServerEnv()

  return {
    DB: requireBinding(env.DB, 'DB'),
    CHAT_ASSETS: requireBinding(env.CHAT_ASSETS, 'CHAT_ASSETS'),
  }
}
