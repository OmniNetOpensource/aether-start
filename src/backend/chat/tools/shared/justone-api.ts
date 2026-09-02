import { isAbortError } from '@/backend/chat/abort';
import { getServerEnv } from '@/backend/platform/cloudflare/env';

export const JUST_ONE_API_TIMEOUT_MS = 120_000;

type JustOneApiRequest = {
  endpoint: string;
  method: 'GET' | 'POST';
  parameters: URLSearchParams;
};

export type JustOneApiResult = { ok: true; data: unknown } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const responseDetails = (payload: Record<string, unknown>): string => {
  const details: string[] = [];

  if (typeof payload.code === 'number') {
    details.push(`code ${payload.code}`);
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    details.push(payload.message.trim());
  }
  if (typeof payload.requestId === 'string' && payload.requestId.trim()) {
    details.push(`requestId ${payload.requestId.trim()}`);
  }

  return details.length > 0 ? ` (${details.join(', ')})` : '';
};

export const requestJustOneApi = async (
  request: JustOneApiRequest,
  signal?: AbortSignal,
  timeoutMs = JUST_ONE_API_TIMEOUT_MS,
): Promise<JustOneApiResult> => {
  const { JUSTONEAPI_TOKEN: token } = getServerEnv();
  if (!token) {
    return { ok: false, error: 'JUSTONEAPI_TOKEN is not set' };
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (timeoutMs <= 0) {
    return { ok: false, error: 'Just One API request timed out' };
  }

  const parameters = new URLSearchParams(request.parameters);
  parameters.set('token', token);

  const requestUrl = new URL(request.endpoint, 'https://api.justoneapi.com');
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortRequest = () => controller.abort();
  signal?.addEventListener('abort', abortRequest);

  const requestInit: RequestInit = {
    method: request.method,
    redirect: 'manual',
    signal: controller.signal,
  };

  if (request.method === 'GET') {
    requestUrl.search = parameters.toString();
  } else {
    requestInit.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    requestInit.body = parameters;
  }

  try {
    const response = await fetch(requestUrl, requestInit);
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: `Just One API HTTP ${response.status}` };
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        error: response.ok
          ? 'Just One API returned invalid JSON'
          : `Just One API HTTP ${response.status}`,
      };
    }

    if (!isRecord(payload)) {
      return { ok: false, error: 'Just One API returned an invalid response' };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `Just One API HTTP ${response.status}${responseDetails(payload)}`,
      };
    }

    if (typeof payload.code !== 'number') {
      return { ok: false, error: 'Just One API returned an invalid response' };
    }

    if (payload.code !== 0) {
      return {
        ok: false,
        error: `Just One API request failed${responseDetails(payload)}`,
      };
    }

    if (!('data' in payload)) {
      return { ok: false, error: 'Just One API returned an invalid response' };
    }

    return { ok: true, data: payload.data };
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (timedOut || isAbortError(error)) {
      return { ok: false, error: 'Just One API request timed out' };
    }

    return { ok: false, error: 'Just One API network request failed' };
  } finally {
    signal?.removeEventListener('abort', abortRequest);
    clearTimeout(timeoutId);
  }
};
