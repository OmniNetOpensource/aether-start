import type { ChatErrorCode, ChatErrorInfo } from '@/shared/chat/chat-api';

const ERROR_COPY: Record<ChatErrorCode, { title: string; cause: string; suggestion: string }> = {
  invalid_request: {
    title: 'Request rejected',
    cause: 'The provider rejected the request format or parameters.',
    suggestion: 'Check the selected model, tools, and request payload.',
  },
  authentication_failed: {
    title: 'Authentication failed',
    cause: 'The upstream API key is invalid, expired, or missing.',
    suggestion: 'Check provider credentials or switch to another backend.',
  },
  permission_denied: {
    title: 'Permission denied',
    cause: 'The current provider key or account cannot access this resource.',
    suggestion: 'Check account permissions or switch to another backend.',
  },
  quota_exceeded: {
    title: 'Quota exceeded',
    cause: 'The account does not have enough prompt quota for this request.',
    suggestion: 'Redeem more quota before trying again.',
  },
  not_found: {
    title: 'Model or endpoint not found',
    cause: 'The configured model or upstream endpoint does not exist.',
    suggestion: 'Check the model mapping and backend base URL.',
  },
  conflict: {
    title: 'Request conflict',
    cause: 'The upstream service rejected the request because of a state conflict.',
    suggestion: 'Retry the request once the previous operation finishes.',
  },
  rate_limit: {
    title: 'Rate limit reached',
    cause: 'Too many requests were sent in a short time.',
    suggestion: 'Wait a moment and try again.',
  },
  model_unavailable: {
    title: 'Model unavailable',
    cause: 'The target model is loading, unavailable, or the upstream gateway cannot reach it.',
    suggestion: 'Retry later or switch to another model.',
  },
  service_unavailable: {
    title: 'Service unavailable',
    cause: 'The upstream service is overloaded, under maintenance, or temporarily unavailable.',
    suggestion: 'Retry later.',
  },
  timeout: {
    title: 'Request timed out',
    cause: 'The request took too long or the upstream service stopped responding in time.',
    suggestion: 'Retry later or try a faster model.',
  },
  network_error: {
    title: 'Network connection issue',
    cause: 'The connection to the upstream provider or proxy was interrupted.',
    suggestion: 'Check your network, then retry or switch backend.',
  },
  server_error: {
    title: 'Provider server error',
    cause: 'The upstream provider returned a 5xx server error.',
    suggestion: 'Retry later.',
  },
  provider_error: {
    title: 'Provider request failed',
    cause: 'The upstream provider returned an error that was not classified more specifically.',
    suggestion: 'Retry later or inspect provider logs.',
  },
  unknown: {
    title: 'Request failed',
    cause: 'The service or network encountered an unexpected error.',
    suggestion: 'Retry later or refresh the page.',
  },
};

const formatStructuredErrorMessage = (safeMessage: string, errorInfo: ChatErrorInfo) => {
  const copy = ERROR_COPY[errorInfo.code] ?? ERROR_COPY.unknown;
  const lines = [copy.title, `Possible cause: ${copy.cause}`, `Suggestion: ${copy.suggestion}`];

  if (errorInfo.provider) {
    lines.push(`Provider: ${errorInfo.provider}`);
  }

  if (errorInfo.model) {
    lines.push(`Model: ${errorInfo.model}`);
  }

  if (errorInfo.backend) {
    lines.push(`Backend: ${errorInfo.backend}`);
  }

  if (typeof errorInfo.status === 'number') {
    lines.push(`HTTP status: ${errorInfo.status}`);
  }

  if (typeof errorInfo.retryable === 'boolean') {
    lines.push(`Retryable: ${errorInfo.retryable ? 'yes' : 'no'}`);
  }

  const details = errorInfo.details || safeMessage;
  if (details) {
    lines.push(`Details: ${details}`);
  }

  return lines.join('\n');
};

export const enhanceServerErrorMessage = (safeMessage: string, errorInfo?: ChatErrorInfo) => {
  if (errorInfo) {
    return formatStructuredErrorMessage(safeMessage, errorInfo);
  }

  const lowerMessage = safeMessage.toLowerCase();

  if (lowerMessage.includes('load error') || lowerMessage.includes('load_error')) {
    return (
      `Model load failed: ${safeMessage}\n` +
      'Possible cause: network instability or model service unavailable.\n' +
      'Suggestion: retry later or switch to another model.'
    );
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return (
      `Request timed out: ${safeMessage}\n` +
      'Possible cause: network latency is too high or the server responded too slowly.\n' +
      'Suggestion: retry later.'
    );
  }

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
    return (
      `Rate limit reached: ${safeMessage}\n` +
      'Possible cause: too many requests in a short time.\n' +
      'Suggestion: wait a moment and try again.'
    );
  }

  if (lowerMessage.includes('unavailable') || lowerMessage.includes('503')) {
    return (
      `Service unavailable: ${safeMessage}\n` +
      'Possible cause: maintenance or temporary overload.\n' +
      'Suggestion: retry later.'
    );
  }

  if (lowerMessage.includes('connection') || lowerMessage.includes('network')) {
    return (
      `Network connection issue: ${safeMessage}\n` +
      'Possible cause: unstable connection or interrupted request.\n' +
      'Suggestion: check your network and try again.'
    );
  }

  return (
    `Request failed: ${safeMessage}\n` +
    'Possible cause: service or network issue.\n' +
    'Suggestion: retry later or refresh the page.'
  );
};
