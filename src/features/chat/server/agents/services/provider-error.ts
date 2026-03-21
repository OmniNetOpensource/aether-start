import type { BackendConfig } from '@/server/agents/services/model-provider-config';
import type {
  ChatErrorCode,
  ChatErrorInfo,
  ChatErrorProvider,
  ChatServerToClientEvent,
} from '@/types/chat-api';

type ProviderErrorInput = {
  provider: Exclude<ChatErrorProvider, 'system'>;
  model: string;
  backendConfig: BackendConfig;
  error: unknown;
  fallbackMessage: string;
};

const RETRYABLE_CODES = new Set<ChatErrorCode>([
  'network_error',
  'timeout',
  'rate_limit',
  'model_unavailable',
  'service_unavailable',
  'server_error',
]);

const PROVIDER_LABELS: Record<Exclude<ChatErrorProvider, 'system'>, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-responses': 'OpenAI Responses',
  gemini: 'Gemini',
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
};

const getString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getErrorLikeName = (value: unknown): string | undefined => {
  return getString(asRecord(value)?.name);
};

const getErrorLikeMessage = (value: unknown): string | undefined => {
  return getString(asRecord(value)?.message);
};

const getStatus = (value: unknown): number | undefined => {
  const status = asRecord(value)?.status;
  return typeof status === 'number' ? status : undefined;
};

const formatBackend = (baseURL: string): string => {
  try {
    const url = new URL(baseURL);
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return `${url.host}${path}`;
  } catch {
    return baseURL;
  }
};

const getCause = (value: unknown): unknown => {
  return asRecord(value)?.cause;
};

const buildDetails = (error: unknown, fallbackMessage: string): string => {
  const primaryMessage =
    error instanceof Error ? getString(error.message) : getErrorLikeMessage(error);

  const cause = getCause(error);
  const causeMessage =
    cause instanceof Error
      ? getString(cause.message)
      : (getErrorLikeMessage(cause) ?? getString(cause));

  if (primaryMessage && causeMessage && causeMessage !== primaryMessage) {
    return `${primaryMessage} | cause: ${causeMessage}`;
  }

  return primaryMessage ?? causeMessage ?? fallbackMessage;
};

const classifyProviderErrorCode = (error: unknown, details: string): ChatErrorCode => {
  const status = getStatus(error);
  const name = (getErrorLikeName(error) ?? '').toLowerCase();
  const lowerDetails = details.toLowerCase();

  if (lowerDetails.includes('load error') || lowerDetails.includes('load_error')) {
    return 'model_unavailable';
  }

  if (
    status === 408 ||
    name.includes('timeout') ||
    lowerDetails.includes('timed out') ||
    lowerDetails.includes('timeout')
  ) {
    return 'timeout';
  }

  if (status === 429 || name.includes('ratelimit')) {
    return 'rate_limit';
  }

  if (status === 401 || name.includes('authentication')) {
    return 'authentication_failed';
  }

  if (status === 403 || name.includes('permission')) {
    return 'permission_denied';
  }

  if (status === 404 || name.includes('notfound')) {
    return 'not_found';
  }

  if (status === 409 || name.includes('conflict')) {
    return 'conflict';
  }

  if (
    status === 400 ||
    status === 422 ||
    name.includes('badrequest') ||
    name.includes('unprocessable')
  ) {
    return 'invalid_request';
  }

  if (status === 502 || status === 503 || status === 504 || lowerDetails.includes('unavailable')) {
    return 'service_unavailable';
  }

  if (
    name.includes('connection') ||
    lowerDetails.includes('connection error') ||
    lowerDetails.includes('fetch failed') ||
    lowerDetails.includes('network') ||
    lowerDetails.includes('econnreset') ||
    lowerDetails.includes('econnrefused') ||
    lowerDetails.includes('enotfound') ||
    lowerDetails.includes('eai_again')
  ) {
    return 'network_error';
  }

  if (typeof status === 'number' && status >= 500) {
    return 'server_error';
  }

  if (name.includes('apierror') || name.includes('error')) {
    return 'provider_error';
  }

  return 'unknown';
};

export const buildProviderErrorInfo = ({
  provider,
  model,
  backendConfig,
  error,
  fallbackMessage,
}: ProviderErrorInput): ChatErrorInfo => {
  const details = buildDetails(error, fallbackMessage);
  const code = classifyProviderErrorCode(error, details);
  const status = getStatus(error);

  return {
    code,
    provider,
    model,
    backend: formatBackend(backendConfig.baseURL),
    status,
    retryable: RETRYABLE_CODES.has(code),
    details,
  };
};

export const buildProviderErrorEvent = (input: ProviderErrorInput): ChatServerToClientEvent => {
  const error = buildProviderErrorInfo(input);
  const providerLabel = PROVIDER_LABELS[input.provider];

  return {
    type: 'error',
    message: `${providerLabel} request failed (model=${input.model}): ${error.details ?? input.fallbackMessage}`,
    error,
  };
};
