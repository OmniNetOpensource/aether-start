import { ChatTool, FetchProvider, ToolDefinition, ToolHandler } from './tool-types';
import { log } from '@/features/chat/agent-runtime';
import { Supadata } from '@supadata/js';
import { getServerEnv } from '@/shared/worker/env';
import { arrayBufferToBase64 } from '@/shared/worker/base64';

type FetchUrlArgs = {
  url: string;
  response_type: 'markdown' | 'image' | 'youtube';
};

const parseFetchUrlArgs = (args: unknown): FetchUrlArgs => {
  if (!args || typeof args !== 'object') {
    throw new Error('fetch_url requires an object with a URL');
  }

  const url = (args as { url?: unknown }).url;
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('fetch_url requires a non-empty URL string');
  }

  if (!URL.canParse(url)) {
    throw new Error('Invalid URL format');
  }

  const response_type = (args as { response_type?: unknown }).response_type;
  if (response_type !== 'markdown' && response_type !== 'image' && response_type !== 'youtube') {
    throw new Error("fetch_url requires response_type to be 'markdown', 'image', or 'youtube'");
  }

  return { url, response_type };
};

const FETCH_URL_INTERVAL_MS = 2_000;
let lastFetchUrlAt = 0;
let fetchUrlQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const enqueueFetchUrlCall = async <T>(task: () => Promise<T>): Promise<T> => {
  const waitForTurn = fetchUrlQueue;
  let releaseQueue = () => {};
  fetchUrlQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await waitForTurn;

  const runTask = async () => {
    const now = Date.now();
    const elapsed = now - lastFetchUrlAt;

    if (elapsed < FETCH_URL_INTERVAL_MS) {
      const waitTime = FETCH_URL_INTERVAL_MS - elapsed;
      await sleep(waitTime);
    }

    lastFetchUrlAt = Date.now();
    return task();
  };

  try {
    return await runTask();
  } finally {
    releaseQueue();
  }
};

// Image URL detection
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];

const isDirectImageUrl = (url: string): boolean => {
  if (!URL.canParse(url)) {
    return false;
  }

  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname.toLowerCase();

  if (IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return true;
  }

  const imageHostPatterns = [
    /^i\.imgur\.com/,
    /^images\.unsplash\.com/,
    /^pbs\.twimg\.com/,
    /\.cloudinary\.com.*\/image\//,
    /\.githubusercontent\.com.*\.(png|jpg|jpeg|gif|webp)$/i,
  ];

  const host = parsedUrl.host.toLowerCase();
  const fullPath = host + pathname;

  return imageHostPatterns.some((pattern) => pattern.test(fullPath));
};

type ImageResult = {
  type: 'image';
  data_url: string;
  mime_type: string;
  size_bytes: number;
};

const fetchDirectImage = async (url: string, signal?: AbortSignal): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AetherBot/1.0)',
      },
    });

    if (!response.ok) {
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type') || 'image/png';

    const arrayBuffer = await response.arrayBuffer();

    const base64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = contentType.split(';')[0].trim();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const result: ImageResult = {
      type: 'image',
      data_url: dataUrl,
      mime_type: mimeType,
      size_bytes: arrayBuffer.byteLength,
    };

    return JSON.stringify(result);
  } catch (error) {
    const isAbortError =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    const message = isAbortError
      ? 'Request timed out'
      : typeof error === 'object' && error !== null
        ? (error as Error).message
        : String(error);
    log('FETCH', `Direct image error: ${message}`);
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeoutId);
  }
};

export const fetchMarkdownWithJina = async (url: string, signal?: AbortSignal): Promise<string> => {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 80_000);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort);

  const { JINA_API_KEY } = getServerEnv();
  const headers: Record<string, string> = {
    'X-Token-Budget': '200000',
    'X-Engine': 'browser',
    'X-Timeout': '30',
  };
  if (JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${JINA_API_KEY}`;
  }

  try {
    const jinaResponse = await fetch(jinaUrl, {
      headers,
      signal: controller.signal,
    });

    if (!jinaResponse.ok) {
      log('FETCH', `Jina AI Reader HTTP error: ${jinaResponse.status} ${jinaResponse.statusText}`);
      return `Error: HTTP ${jinaResponse.status} ${jinaResponse.statusText}`;
    }

    return await jinaResponse.text();
  } catch (error) {
    const isAbortError =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    const message = isAbortError
      ? 'Request timed out'
      : typeof error === 'object' && error !== null
        ? (error as Error).message
        : String(error);
    log('FETCH', `Error: ${message}`);
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeoutId);
  }
};

const fetchMarkdownWithFirecrawl = async (url: string, signal?: AbortSignal): Promise<string> => {
  const { FIRECRAWL_API_KEY } = getServerEnv();
  if (!FIRECRAWL_API_KEY) {
    log('FETCH', 'Missing FIRECRAWL_API_KEY');
    return 'Error: FIRECRAWL_API_KEY is not set';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 80_000);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort);

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: controller.signal,
    });

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      log('FETCH', 'Firecrawl: response was not JSON');
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    if (!response.ok) {
      const errText =
        typeof raw === 'object' && raw !== null && 'error' in raw && typeof raw.error === 'string'
          ? raw.error
          : `${response.status} ${response.statusText}`;
      log('FETCH', `Firecrawl HTTP error: ${errText}`);
      return `Error: ${errText}`;
    }

    if (typeof raw !== 'object' || raw === null) {
      log('FETCH', 'Firecrawl: invalid JSON body');
      return 'Error: Invalid Firecrawl response';
    }

    if ('success' in raw && raw.success === false) {
      const errMsg =
        'error' in raw && typeof raw.error === 'string' ? raw.error : 'Firecrawl scrape failed';
      log('FETCH', `Firecrawl: ${errMsg}`);
      return `Error: ${errMsg}`;
    }

    if (!('data' in raw) || typeof raw.data !== 'object' || raw.data === null) {
      log('FETCH', 'Firecrawl: missing data');
      return 'Error: Invalid Firecrawl response';
    }

    const data = raw.data;
    if (!('markdown' in data) || typeof data.markdown !== 'string') {
      log('FETCH', 'Firecrawl: missing markdown');
      return 'Error: Invalid Firecrawl response';
    }

    return data.markdown;
  } catch (error) {
    const isAbortError =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    const message = isAbortError
      ? 'Request timed out'
      : typeof error === 'object' && error !== null
        ? (error as Error).message
        : String(error);
    log('FETCH', `Firecrawl error: ${message}`);
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeoutId);
  }
};

const fetchMarkdownWithExa = async (url: string, signal?: AbortSignal): Promise<string> => {
  const { EXA_API_KEY } = getServerEnv();
  if (!EXA_API_KEY) {
    log('FETCH', 'Missing EXA_API_KEY');
    return 'Error: EXA_API_KEY is not set';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 80_000);
  const linkedAbort = () => controller.abort();
  signal?.addEventListener('abort', linkedAbort);

  try {
    const response = await fetch('https://api.exa.ai/contents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        urls: [url],
        text: true,
        livecrawlTimeout: 15000,
      }),
      signal: controller.signal,
    });

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      log('FETCH', 'Exa: response was not JSON');
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    if (!response.ok) {
      const errMsg =
        typeof raw === 'object' &&
        raw !== null &&
        'error' in raw &&
        typeof (raw as { error?: unknown }).error === 'string'
          ? ((raw as { error: string }).error)
          : `${response.status} ${response.statusText}`;
      log('FETCH', `Exa HTTP error: ${errMsg}`);
      return `Error: ${errMsg}`;
    }

    if (typeof raw !== 'object' || raw === null) {
      return 'Error: Invalid Exa response';
    }

    const statuses = (raw as { statuses?: unknown }).statuses;
    if (Array.isArray(statuses)) {
      const failed = statuses.find(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          (item as { status?: unknown }).status === 'error',
      ) as { error?: { tag?: string } } | undefined;
      if (failed) {
        const tag = failed.error?.tag ?? 'unknown';
        log('FETCH', `Exa per-URL error: ${tag}`);
        return `Error: ${tag}`;
      }
    }

    const results = (raw as { results?: unknown }).results;
    if (!Array.isArray(results) || results.length === 0) {
      return 'Error: Exa returned no results';
    }

    const first = results[0];
    if (typeof first !== 'object' || first === null) {
      return 'Error: Invalid Exa result';
    }

    const text = (first as { text?: unknown }).text;
    if (typeof text !== 'string' || !text) {
      return 'Error: Exa result missing text';
    }

    return text;
  } catch (error) {
    const isAbortError =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    const message = isAbortError
      ? 'Request timed out'
      : typeof error === 'object' && error !== null
        ? (error as Error).message
        : String(error);
    log('FETCH', `Exa error: ${message}`);
    return `Error: ${message}`;
  } finally {
    signal?.removeEventListener('abort', linkedAbort);
    clearTimeout(timeoutId);
  }
};

const YOUTUBE_POLL_INTERVAL_MS = 3_000;
const YOUTUBE_MAX_POLLS = 60;

const fetchYoutubeTranscript = async (url: string, signal?: AbortSignal): Promise<string> => {
  const { SUPADATA_API_KEY: apiKey } = getServerEnv();
  if (!apiKey) {
    log('FETCH', 'Missing SUPADATA_API_KEY');
    return 'Error: SUPADATA_API_KEY is not set';
  }

  const supadata = new Supadata({ apiKey });

  try {
    const result = await supadata.transcript({
      url,
      text: true,
      mode: 'auto',
    });

    if ('jobId' in result && result.jobId) {
      const jobId = result.jobId;

      for (let i = 1; i <= YOUTUBE_MAX_POLLS; i++) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        await sleep(YOUTUBE_POLL_INTERVAL_MS);

        const job = await supadata.transcript.getJobStatus(jobId);

        if (job.status === 'completed' && job.result) {
          const transcript = job.result;
          return typeof transcript.content === 'string'
            ? transcript.content
            : JSON.stringify(transcript.content);
        }

        if (job.status === 'failed') {
          const errMsg = job.error?.message || 'Job failed';
          log('FETCH', `Transcript job failed: ${errMsg}`);
          return `Error: ${errMsg}`;
        }
      }

      log('FETCH', 'Transcript job timed out');
      return 'Error: Transcript job timed out after polling';
    }

    const transcript = result as { content: unknown };
    return typeof transcript.content === 'string'
      ? transcript.content
      : JSON.stringify(transcript.content);
  } catch (error) {
    const message =
      typeof error === 'object' && error !== null ? (error as Error).message : String(error);
    log('FETCH', `Transcript error: ${message}`);
    return `Error: ${message}`;
  }
};

const fetchUrl: ToolHandler = async (args, signal, context) => {
  const { url, response_type } = parseFetchUrlArgs(args);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (response_type === 'youtube') {
    return fetchYoutubeTranscript(url, signal);
  }

  if (response_type === 'image') {
    if (!isDirectImageUrl(url)) {
      return "Error: response_type 'image' only accepts direct image URLs (e.g. .jpg, .png, .gif, .webp)";
    }
    return enqueueFetchUrlCall(() => fetchDirectImage(url, signal));
  }

  const provider: FetchProvider = context?.fetchProvider ?? 'jina';
  return enqueueFetchUrlCall(() => {
    if (provider === 'firecrawl') {
      return fetchMarkdownWithFirecrawl(url, signal);
    }
    if (provider === 'exa') {
      return fetchMarkdownWithExa(url, signal);
    }
    return fetchMarkdownWithJina(url, signal);
  });
};

const fetchUrlSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      "Fetch content from a URL with three response modes: 'markdown' converts webpage content to readable text (useful for reading articles, documentation, or API responses); 'image' fetches direct image URLs only ; 'youtube' extracts transcript/subtitles from a YouTube video URL.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
        response_type: {
          type: 'string',
          enum: ['markdown', 'image', 'youtube'],
          description:
            "Response format: 'markdown' for text content (converts HTML to readable text), 'image' for direct image URLs only (jpg, png, gif, webp, etc.), 'youtube' for extracting transcript/subtitles from YouTube videos",
        },
      },
      required: ['url', 'response_type'],
    },
  },
};

export const fetchUrlTool: ToolDefinition = {
  spec: fetchUrlSpec,
  handler: fetchUrl,
};
