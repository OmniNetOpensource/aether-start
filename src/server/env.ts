import { env as workerEnv } from 'cloudflare:workers'

type ServerEnv = {
  ANTHROPIC_API_KEY_RIGHTCODE?: string
  ANTHROPIC_BASE_URL_RIGHTCODE?: string
  ANTHROPIC_API_KEY_IKUNCODE?: string
  ANTHROPIC_BASE_URL_IKUNCODE?: string
  DMX_APIKEY?: string
  DMX_BASEURL?: string
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
    ANTHROPIC_API_KEY_RIGHTCODE:
      readString(bindings.ANTHROPIC_API_KEY_RIGHTCODE) ??
      readStringFromProcess('ANTHROPIC_API_KEY_RIGHTCODE'),
    ANTHROPIC_BASE_URL_RIGHTCODE:
      readString(bindings.ANTHROPIC_BASE_URL_RIGHTCODE) ??
      readStringFromProcess('ANTHROPIC_BASE_URL_RIGHTCODE'),
    ANTHROPIC_API_KEY_IKUNCODE:
      readString(bindings.ANTHROPIC_API_KEY_IKUNCODE) ??
      readStringFromProcess('ANTHROPIC_API_KEY_IKUNCODE'),
    ANTHROPIC_BASE_URL_IKUNCODE:
      readString(bindings.ANTHROPIC_BASE_URL_IKUNCODE) ??
      readStringFromProcess('ANTHROPIC_BASE_URL_IKUNCODE'),
    DMX_APIKEY:
      readString(bindings.DMX_APIKEY) ??
      readStringFromProcess('DMX_APIKEY'),
    DMX_BASEURL:
      readString(bindings.DMX_BASEURL) ??
      readStringFromProcess('DMX_BASEURL'),
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
