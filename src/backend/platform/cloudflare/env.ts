import { env as workerEnv } from 'cloudflare:workers';

type ServerEnv = {
  PORT?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  /** Comma-separated origins, e.g. `http://127.0.0.1:3010,http://localhost:3010` */
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
  LLM_STREAM_LOGGING?: string;
  LLM_STREAM_LOGGING_MAX_CHARS?: string;
  MOONSHOT_API_KEY?: string;
  ANTHROPIC_API_KEY_IKUNCODE?: string;
  /** OpenAI-compatible key for ikun gateway */
  OPENAI_API_KEY_IKUNCODE?: string;
  GEMINI_API_KEY_IKUNCODE?: string;
  GEMINI_BASE_URL_IKUNCODE?: string;
  /** Google AI Studio / Gemini API (generativelanguage.googleapis.com) */
  GEMINI_API_KEY_AISTUDIO?: string;
  OPENROUTER_API_KEY?: string;
  SERP_API_KEY?: string;
  SUPADATA_API_KEY?: string;
  JINA_API_KEY?: string;
  RESEND_API_KEY?: string;
  NETIFY_TOKEN?: string;
  DB?: D1Database;
  CHAT_ASSETS?: R2Bucket;
  NODE_ENV?: string;
};

const readStringFromProcess = (key: string): string | undefined => {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }

  const value = process.env[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const getServerEnv = (): ServerEnv => {
  const bindings = workerEnv as Partial<ServerEnv>;

  return {
    PORT: readStringFromProcess('PORT'),
    BETTER_AUTH_SECRET:
      readString(bindings.BETTER_AUTH_SECRET) ?? readStringFromProcess('BETTER_AUTH_SECRET'),
    BETTER_AUTH_URL:
      readString(bindings.BETTER_AUTH_URL) ?? readStringFromProcess('BETTER_AUTH_URL'),
    BETTER_AUTH_TRUSTED_ORIGINS:
      readString((bindings as Record<string, unknown>).BETTER_AUTH_TRUSTED_ORIGINS) ??
      readStringFromProcess('BETTER_AUTH_TRUSTED_ORIGINS'),
    ADMIN_EMAIL_ALLOWLIST:
      readString((bindings as Record<string, unknown>).ADMIN_EMAIL_ALLOWLIST) ??
      readStringFromProcess('ADMIN_EMAIL_ALLOWLIST'),
    LLM_STREAM_LOGGING:
      readString((bindings as Record<string, unknown>).LLM_STREAM_LOGGING) ??
      readStringFromProcess('LLM_STREAM_LOGGING'),
    LLM_STREAM_LOGGING_MAX_CHARS:
      readString((bindings as Record<string, unknown>).LLM_STREAM_LOGGING_MAX_CHARS) ??
      readStringFromProcess('LLM_STREAM_LOGGING_MAX_CHARS'),
    MOONSHOT_API_KEY:
      readString((bindings as Record<string, unknown>).MOONSHOT_API_KEY) ??
      readStringFromProcess('MOONSHOT_API_KEY'),
    ANTHROPIC_API_KEY_IKUNCODE:
      readString(bindings.ANTHROPIC_API_KEY_IKUNCODE) ??
      readStringFromProcess('ANTHROPIC_API_KEY_IKUNCODE'),
    OPENAI_API_KEY_IKUNCODE:
      readString((bindings as Record<string, unknown>).OPENAI_API_KEY_IKUNCODE) ??
      readStringFromProcess('OPENAI_API_KEY_IKUNCODE'),
    GEMINI_API_KEY_IKUNCODE:
      readString(bindings.GEMINI_API_KEY_IKUNCODE) ??
      readStringFromProcess('GEMINI_API_KEY_IKUNCODE'),
    GEMINI_BASE_URL_IKUNCODE:
      readString((bindings as Record<string, unknown>).GEMINI_BASE_URL_IKUNCODE) ??
      readStringFromProcess('GEMINI_BASE_URL_IKUNCODE'),
    GEMINI_API_KEY_AISTUDIO:
      readString((bindings as Record<string, unknown>).GEMINI_API_KEY_AISTUDIO) ??
      readStringFromProcess('GEMINI_API_KEY_AISTUDIO'),
    OPENROUTER_API_KEY:
      readString((bindings as Record<string, unknown>).OPENROUTER_API_KEY) ??
      readStringFromProcess('OPENROUTER_API_KEY'),
    SERP_API_KEY: readString(bindings.SERP_API_KEY) ?? readStringFromProcess('SERP_API_KEY'),
    SUPADATA_API_KEY:
      readString(bindings.SUPADATA_API_KEY) ?? readStringFromProcess('SUPADATA_API_KEY'),
    JINA_API_KEY:
      readString((bindings as Record<string, unknown>).JINA_API_KEY) ??
      readStringFromProcess('JINA_API_KEY'),
    RESEND_API_KEY: readString(bindings.RESEND_API_KEY) ?? readStringFromProcess('RESEND_API_KEY'),
    NETIFY_TOKEN: readString(bindings.NETIFY_TOKEN) ?? readStringFromProcess('NETIFY_TOKEN'),
    NODE_ENV: readString(bindings.NODE_ENV) ?? readStringFromProcess('NODE_ENV') ?? 'production',
    DB: bindings.DB,
    CHAT_ASSETS: bindings.CHAT_ASSETS,
  };
};

const requireBinding = <T>(value: T | undefined, bindingName: string): T => {
  if (!value) {
    throw new Error(`Missing worker binding: ${bindingName}`);
  }
  return value;
};

export const getServerBindings = () => {
  const env = getServerEnv();

  return {
    DB: requireBinding(env.DB, 'DB'),
    CHAT_ASSETS: env.CHAT_ASSETS,
  };
};
