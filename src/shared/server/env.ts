import { env as workerEnv } from 'cloudflare:workers'

type ServerEnv = {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  ADMIN_EMAIL_ALLOWLIST?: string
  LLM_STREAM_LOGGING?: string
  LLM_STREAM_LOGGING_MAX_CHARS?: string
  ANTHROPIC_API_KEY_RIGHTCODE?: string
  ANTHROPIC_BASE_URL_RIGHTCODE?: string
  ANTHROPIC_API_KEY_RIGHTCODE_SALE?: string
  ANTHROPIC_BASE_URL_RIGHTCODE_SALE?: string
  GEMINI_API_KEY_RIGHTCODE?: string
  GEMINI_BASE_URL_RIGHTCODE?: string
  OPENAI_API_KEY_RIGHTCODE?: string
  OPENAI_BASE_URL_RIGHTCODE?: string
  ANTHROPIC_API_KEY_IKUNCODE?: string
  ANTHROPIC_BASE_URL_IKUNCODE?: string
  GEMINI_API_KEY_IKUNCODE?: string
  GEMINI_BASE_URL_IKUNCODE?: string
  DMX_APIKEY?: string
  DMX_BASEURL?: string
  OPENROUTER_API_KEY?: string
  CUBENCE_API_KEY?: string
  CUBENCE_BASE_URL?: string
  SERP_API_KEY?: string
  SUPADATA_API_KEY?: string
  JINA_API_KEY?: string
  RESEND_API_KEY?: string
  MINIMAX_API_KEY?: string
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
    BETTER_AUTH_SECRET:
      readString(bindings.BETTER_AUTH_SECRET) ??
      readStringFromProcess('BETTER_AUTH_SECRET'),
    BETTER_AUTH_URL:
      readString(bindings.BETTER_AUTH_URL) ??
      readStringFromProcess('BETTER_AUTH_URL'),
    ADMIN_EMAIL_ALLOWLIST:
      readString((bindings as Record<string, unknown>).ADMIN_EMAIL_ALLOWLIST) ??
      readStringFromProcess('ADMIN_EMAIL_ALLOWLIST'),
    LLM_STREAM_LOGGING:
      readString((bindings as Record<string, unknown>).LLM_STREAM_LOGGING) ??
      readStringFromProcess('LLM_STREAM_LOGGING'),
    LLM_STREAM_LOGGING_MAX_CHARS:
      readString((bindings as Record<string, unknown>).LLM_STREAM_LOGGING_MAX_CHARS) ??
      readStringFromProcess('LLM_STREAM_LOGGING_MAX_CHARS'),
    ANTHROPIC_API_KEY_RIGHTCODE:
      readString(bindings.ANTHROPIC_API_KEY_RIGHTCODE) ??
      readStringFromProcess('ANTHROPIC_API_KEY_RIGHTCODE'),
    ANTHROPIC_BASE_URL_RIGHTCODE:
      readString(bindings.ANTHROPIC_BASE_URL_RIGHTCODE) ??
      readStringFromProcess('ANTHROPIC_BASE_URL_RIGHTCODE'),
    ANTHROPIC_API_KEY_RIGHTCODE_SALE:
      readString(bindings.ANTHROPIC_API_KEY_RIGHTCODE_SALE) ??
      readStringFromProcess('ANTHROPIC_API_KEY_RIGHTCODE_SALE'),
    ANTHROPIC_BASE_URL_RIGHTCODE_SALE:
      readString(bindings.ANTHROPIC_BASE_URL_RIGHTCODE_SALE) ??
      readStringFromProcess('ANTHROPIC_BASE_URL_RIGHTCODE_SALE'),
    GEMINI_API_KEY_RIGHTCODE:
      readString(bindings.GEMINI_API_KEY_RIGHTCODE) ??
      readStringFromProcess('GEMINI_API_KEY_RIGHTCODE'),
    GEMINI_BASE_URL_RIGHTCODE:
      readString(bindings.GEMINI_BASE_URL_RIGHTCODE) ??
      readStringFromProcess('GEMINI_BASE_URL_RIGHTCODE'),
    OPENAI_API_KEY_RIGHTCODE:
      readString(bindings.OPENAI_API_KEY_RIGHTCODE) ??
      readStringFromProcess('OPENAI_API_KEY_RIGHTCODE'),
    OPENAI_BASE_URL_RIGHTCODE:
      readString(bindings.OPENAI_BASE_URL_RIGHTCODE) ??
      readStringFromProcess('OPENAI_BASE_URL_RIGHTCODE'),
    ANTHROPIC_API_KEY_IKUNCODE:
      readString(bindings.ANTHROPIC_API_KEY_IKUNCODE) ??
      readStringFromProcess('ANTHROPIC_API_KEY_IKUNCODE'),
    ANTHROPIC_BASE_URL_IKUNCODE:
      readString(bindings.ANTHROPIC_BASE_URL_IKUNCODE) ??
      readStringFromProcess('ANTHROPIC_BASE_URL_IKUNCODE'),
    GEMINI_API_KEY_IKUNCODE:
      readString(bindings.GEMINI_API_KEY_IKUNCODE) ??
      readStringFromProcess('GEMINI_API_KEY_IKUNCODE'),
    GEMINI_BASE_URL_IKUNCODE:
      readString((bindings as Record<string, unknown>).GEMINI_BASE_URL_IKUNCODE) ??
      readStringFromProcess('GEMINI_BASE_URL_IKUNCODE'),
    DMX_APIKEY:
      readString(bindings.DMX_APIKEY) ??
      readStringFromProcess('DMX_APIKEY'),
    DMX_BASEURL:
      readString(bindings.DMX_BASEURL) ??
      readStringFromProcess('DMX_BASEURL'),
    OPENROUTER_API_KEY:
      readString((bindings as Record<string, unknown>).OPENROUTER_API_KEY) ??
      readStringFromProcess('OPENROUTER_API_KEY'),
    CUBENCE_API_KEY:
      readString((bindings as Record<string, unknown>).CUBENCE_API_KEY) ??
      readStringFromProcess('CUBENCE_API_KEY'),
    CUBENCE_BASE_URL:
      readString((bindings as Record<string, unknown>).CUBENCE_BASE_URL) ??
      readStringFromProcess('CUBENCE_BASE_URL'),
    SERP_API_KEY:
      readString(bindings.SERP_API_KEY) ?? readStringFromProcess('SERP_API_KEY'),
    SUPADATA_API_KEY:
      readString(bindings.SUPADATA_API_KEY) ??
      readStringFromProcess('SUPADATA_API_KEY'),
    JINA_API_KEY:
      readString((bindings as Record<string, unknown>).JINA_API_KEY) ??
      readStringFromProcess('JINA_API_KEY'),
    RESEND_API_KEY:
      readString(bindings.RESEND_API_KEY) ??
      readStringFromProcess('RESEND_API_KEY'),
    MINIMAX_API_KEY:
      readString(bindings.MINIMAX_API_KEY) ??
      readStringFromProcess('MINIMAX_API_KEY'),
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
