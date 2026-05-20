export const FETCH_CLIENT_MAX_CHARS = 32_000;

export type FetchClientPayload =
  | { type: 'markdown'; url: string; content: string; truncated?: boolean }
  | { type: 'youtube'; url: string; content: string; truncated?: boolean }
  | { type: 'image'; url: string; data_url: string; mime_type: string; size_bytes: number }
  | { type: 'error'; url: string; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const truncateFetchContent = (
  text: string,
  max = FETCH_CLIENT_MAX_CHARS,
): { content: string; truncated: boolean } => {
  if (text.length <= max) {
    return { content: text, truncated: false };
  }
  return { content: text.slice(0, max), truncated: true };
};

const getUrlFromArgs = (args: unknown): string => {
  if (!isRecord(args)) {
    return '';
  }
  return typeof args.url === 'string' ? args.url : '';
};

const getResponseTypeFromArgs = (args: unknown): 'markdown' | 'youtube' | null => {
  if (!isRecord(args)) {
    return null;
  }
  if (args.response_type === 'youtube') {
    return 'youtube';
  }
  return 'markdown';
};

export const buildFetchClientPayload = (args: unknown, rawResult: string): FetchClientPayload => {
  const url = getUrlFromArgs(args);
  const trimmed = rawResult.trim();

  if (trimmed.startsWith('Error')) {
    const message = trimmed.replace(/^Error:\s*/, '').split('\n')[0] || trimmed;
    return { type: 'error', url, message };
  }

  try {
    const parsed = JSON.parse(rawResult);
    if (isRecord(parsed) && parsed.type === 'image' && typeof parsed.data_url === 'string') {
      const mime_type = typeof parsed.mime_type === 'string' ? parsed.mime_type : 'image/png';
      const size_bytes = typeof parsed.size_bytes === 'number' ? parsed.size_bytes : 0;
      return {
        type: 'image',
        url,
        data_url: parsed.data_url,
        mime_type,
        size_bytes,
      };
    }
  } catch {
    /* plain text markdown / youtube */
  }

  const responseType = getResponseTypeFromArgs(args);
  const { content, truncated } = truncateFetchContent(rawResult);

  if (responseType === 'youtube') {
    if (truncated) {
      return { type: 'youtube', url, content, truncated: true };
    }
    return { type: 'youtube', url, content };
  }

  if (truncated) {
    return { type: 'markdown', url, content, truncated: true };
  }
  return { type: 'markdown', url, content };
};

export const parseFetchClientPayload = (raw: string): FetchClientPayload | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return null;
    }

    if (parsed.type === 'fetch_result') {
      return null;
    }

    const url = typeof parsed.url === 'string' ? parsed.url : '';

    if (parsed.type === 'error' && typeof parsed.message === 'string') {
      return { type: 'error', url, message: parsed.message };
    }

    if (parsed.type === 'image' && typeof parsed.data_url === 'string') {
      const mime_type = typeof parsed.mime_type === 'string' ? parsed.mime_type : 'image/png';
      const size_bytes = typeof parsed.size_bytes === 'number' ? parsed.size_bytes : 0;
      return {
        type: 'image',
        url,
        data_url: parsed.data_url,
        mime_type,
        size_bytes,
      };
    }

    if (
      (parsed.type === 'markdown' || parsed.type === 'youtube') &&
      typeof parsed.content === 'string'
    ) {
      const truncated = parsed.truncated === true;
      if (parsed.type === 'youtube') {
        if (truncated) {
          return { type: 'youtube', url, content: parsed.content, truncated: true };
        }
        return { type: 'youtube', url, content: parsed.content };
      }
      if (truncated) {
        return { type: 'markdown', url, content: parsed.content, truncated: true };
      }
      return { type: 'markdown', url, content: parsed.content };
    }

    return null;
  } catch {
    return null;
  }
};

export const stringifyFetchClientPayload = (payload: FetchClientPayload): string =>
  JSON.stringify(payload);
