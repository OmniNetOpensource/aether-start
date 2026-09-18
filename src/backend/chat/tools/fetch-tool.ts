import { isAbortError } from '@/backend/chat/abort';
import type { ChatTool, ToolDefinition, ToolHandler } from '@/shared/chat/tool-types';
import { log } from '@/backend/chat/logger';
import { Supadata } from '@supadata/js';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import { arrayBufferToBase64 } from '@/shared/core/base64';
import { createRateLimitedQueue } from './shared/rate-limit';
import { JUST_ONE_API_TIMEOUT_MS, requestJustOneApi } from './shared/justone-api';

type FetchUrlArgs = {
  url: string;
  response_type: 'markdown' | 'image' | 'youtube';
};

const parseFetchUrlArgs = (args: unknown): FetchUrlArgs => {
  if (!args || typeof args !== 'object') {
    throw new Error('fetch_url requires an object with a URL');
  }

  const url = 'url' in args ? args.url : undefined;
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('fetch_url requires a non-empty URL string');
  }

  if (!URL.canParse(url)) {
    throw new Error('Invalid URL format');
  }

  const response_type = 'response_type' in args ? args.response_type : undefined;
  if (response_type !== 'markdown' && response_type !== 'image' && response_type !== 'youtube') {
    throw new Error("fetch_url requires response_type to be 'markdown', 'image', or 'youtube'");
  }

  return { url, response_type };
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const enqueueFetchUrlCall = createRateLimitedQueue(2_000);

const XIAOHONGSHU_NOTE_HOSTS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'rednote.com',
  'www.rednote.com',
]);
const REDDIT_PAGE_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'np.reddit.com',
]);

const isSafePlatformUrl = (url: URL): boolean =>
  (url.protocol === 'http:' || url.protocol === 'https:') &&
  url.username.length === 0 &&
  url.password.length === 0 &&
  url.port.length === 0;

const getXiaohongshuNoteReference = (url: URL): string | null => {
  if (!isSafePlatformUrl(url) || !XIAOHONGSHU_NOTE_HOSTS.has(url.hostname)) {
    return null;
  }

  const match = url.pathname.match(/^\/(explore|discovery\/item)\/([a-z0-9]+)(?:\/|$)/i);
  if (!match?.[2]) {
    return null;
  }

  if (
    match[1] === 'explore' &&
    (url.hostname === 'xiaohongshu.com' || url.hostname === 'www.xiaohongshu.com')
  ) {
    const noteUrl = new URL(url);
    noteUrl.hash = '';
    return noteUrl.href;
  }

  return match[2];
};

const toRedditPostId = (id: string | undefined): string | null =>
  id && /^[a-z0-9]+$/i.test(id) ? `t3_${id.toLowerCase()}` : null;

const getRedditPostId = (url: URL): string | null => {
  if (!isSafePlatformUrl(url)) {
    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'redd.it') {
    return toRedditPostId(pathSegments[0]);
  }

  if (!REDDIT_PAGE_HOSTS.has(url.hostname)) {
    return null;
  }

  const commentsIndex = pathSegments.indexOf('comments');
  if (commentsIndex !== -1) {
    return toRedditPostId(pathSegments[commentsIndex + 1]);
  }

  if (pathSegments[0] === 'gallery') {
    return toRedditPostId(pathSegments[1]);
  }

  return null;
};

const isRedditShareUrl = (url: URL): boolean => {
  if (!isSafePlatformUrl(url) || !REDDIT_PAGE_HOSTS.has(url.hostname)) {
    return false;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  return (
    pathSegments.length === 4 &&
    pathSegments[0] === 'r' &&
    pathSegments[1].length > 0 &&
    pathSegments[2] === 's' &&
    pathSegments[3].length > 0
  );
};

type RedditShareResolution = { ok: true; postId: string } | { ok: false; error: string };

const resolveRedditSharePostId = async (
  shareUrl: URL,
  signal?: AbortSignal,
): Promise<RedditShareResolution> => {
  const timeoutSignal = AbortSignal.timeout(JUST_ONE_API_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let currentUrl = shareUrl;

  try {
    for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: requestSignal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AetherBot/1.0)',
        },
      });
      const location = response.headers.get('location');
      await response.body?.cancel();

      if (
        response.status !== 301 &&
        response.status !== 302 &&
        response.status !== 303 &&
        response.status !== 307 &&
        response.status !== 308
      ) {
        return {
          ok: false,
          error: `Reddit share URL returned HTTP ${response.status} without a redirect`,
        };
      }

      if (!location) {
        return { ok: false, error: 'Reddit share URL redirect is missing a location' };
      }

      const nextUrl = new URL(location, currentUrl);
      if (
        !isSafePlatformUrl(nextUrl) ||
        (nextUrl.hostname !== 'redd.it' && !REDDIT_PAGE_HOSTS.has(nextUrl.hostname))
      ) {
        return { ok: false, error: 'Reddit share URL redirected outside Reddit' };
      }

      const postId = getRedditPostId(nextUrl);
      if (postId) {
        return { ok: true, postId };
      }

      if (!isRedditShareUrl(nextUrl)) {
        return { ok: false, error: 'Reddit share URL did not resolve to a post' };
      }

      currentUrl = nextUrl;
    }

    return { ok: false, error: 'Reddit share URL exceeded 3 redirects' };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    if (timeoutSignal.aborted) {
      return { ok: false, error: 'Reddit share URL resolution timed out' };
    }
    return {
      ok: false,
      error: `Reddit share URL resolution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const stringifyJustOneApiData = (data: unknown): string => {
  if (typeof data === 'string') {
    return data;
  }

  const serialized = JSON.stringify(data, null, 2);
  return typeof serialized === 'string'
    ? serialized
    : 'Error: Just One API returned unsupported data';
};

const fetchXiaohongshuNote = async (
  noteId: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> => {
  const result = await requestJustOneApi(
    {
      endpoint: '/api/xiaohongshu/get-note-detail/v1',
      method: 'GET',
      parameters: new URLSearchParams({ noteId }),
    },
    signal,
    timeoutMs,
  );

  return result.ok ? stringifyJustOneApiData(result.data) : `Error: ${result.error}`;
};

const fetchRedditPost = async (
  postId: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> => {
  const result = await requestJustOneApi(
    {
      endpoint: '/api/reddit/get-post-detail/v1',
      method: 'GET',
      parameters: new URLSearchParams({ postId }),
    },
    signal,
    timeoutMs,
  );

  return result.ok ? stringifyJustOneApiData(result.data) : `Error: ${result.error}`;
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
    const message = isAbortError(error)
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
    const message = isAbortError(error)
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

const fetchUrl: ToolHandler = async (args, signal) => {
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

  const parsedUrl = new URL(url);

  if (
    isSafePlatformUrl(parsedUrl) &&
    parsedUrl.hostname === 'mp.weixin.qq.com' &&
    (parsedUrl.pathname === '/s' || parsedUrl.pathname.startsWith('/s/'))
  ) {
    parsedUrl.hash = '';
    const result = await requestJustOneApi(
      {
        endpoint: '/api/weixin/get-article-detail/v1',
        method: 'GET',
        parameters: new URLSearchParams({
          articleUrl: parsedUrl.href,
          mode: 'TEXT',
        }),
      },
      signal,
      JUST_ONE_API_TIMEOUT_MS,
    );

    return result.ok ? stringifyJustOneApiData(result.data) : `Error: ${result.error}`;
  }

  const xiaohongshuNoteReference = getXiaohongshuNoteReference(parsedUrl);
  if (xiaohongshuNoteReference) {
    return fetchXiaohongshuNote(xiaohongshuNoteReference, signal, JUST_ONE_API_TIMEOUT_MS);
  }

  if (
    isSafePlatformUrl(parsedUrl) &&
    parsedUrl.hostname === 'xhslink.com' &&
    parsedUrl.pathname !== '/'
  ) {
    parsedUrl.hash = '';
    const deadline = Date.now() + JUST_ONE_API_TIMEOUT_MS;
    const resolution = await requestJustOneApi(
      {
        endpoint: '/api/xiaohongshu/share-url-transfer/v1',
        method: 'GET',
        parameters: new URLSearchParams({ shareUrl: parsedUrl.href }),
      },
      signal,
      JUST_ONE_API_TIMEOUT_MS,
    );

    if (!resolution.ok) {
      return `Error: ${resolution.error}`;
    }

    if (
      typeof resolution.data !== 'object' ||
      resolution.data === null ||
      !('redirect_url' in resolution.data) ||
      typeof resolution.data.redirect_url !== 'string' ||
      !URL.canParse(resolution.data.redirect_url)
    ) {
      return 'Error: Just One API returned an invalid Xiaohongshu redirect URL';
    }

    const noteReference = getXiaohongshuNoteReference(new URL(resolution.data.redirect_url));
    if (!noteReference) {
      return 'Error: Xiaohongshu share URL did not resolve to a supported note URL';
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return 'Error: Xiaohongshu share URL request timed out';
    }

    return fetchXiaohongshuNote(noteReference, signal, remainingMs);
  }

  const redditPostId = getRedditPostId(parsedUrl);
  if (redditPostId) {
    return fetchRedditPost(redditPostId, signal, JUST_ONE_API_TIMEOUT_MS);
  }

  if (isRedditShareUrl(parsedUrl)) {
    const deadline = Date.now() + JUST_ONE_API_TIMEOUT_MS;
    const resolution = await resolveRedditSharePostId(parsedUrl, signal);
    if (!resolution.ok) {
      return `Error: ${resolution.error}`;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return 'Error: Reddit share URL request timed out';
    }

    return fetchRedditPost(resolution.postId, signal, remainingMs);
  }

  return enqueueFetchUrlCall(() => fetchMarkdownWithJina(url, signal));
};

const fetchUrlSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      "Fetch content from a URL with three response modes: 'markdown' reads webpages and automatically fetches WeChat articles, Xiaohongshu/RedNote notes, and Reddit posts through their platform APIs; 'image' fetches direct image URLs only; 'youtube' extracts transcript/subtitles from a YouTube video URL.",
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
