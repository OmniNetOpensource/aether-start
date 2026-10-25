import type { ChatTool, ToolDefinition, ToolHandler } from '@/shared/chat/tool-types';
import { log } from '@/backend/chat/logger';
import { z } from 'zod';
import { getServerEnv } from '@/backend/platform/cloudflare/env';
import { createRateLimitedQueue } from './shared/rate-limit';

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

const getXiaohongshuNoteUrl = (url: URL): string | null => {
  if (!isSafePlatformUrl(url) || !XIAOHONGSHU_NOTE_HOSTS.has(url.hostname)) {
    return null;
  }

  if (!/^\/(explore|discovery\/item)\/[a-z0-9]+(?:\/|$)/i.test(url.pathname)) {
    return null;
  }

  const noteUrl = new URL(url);
  noteUrl.hostname = 'www.xiaohongshu.com';
  noteUrl.hash = '';
  return noteUrl.href;
};

const toRedditPostId = (id: string | undefined): string | null =>
  id && /^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : null;

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
  const timeoutSignal = AbortSignal.timeout(20_000);
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

const fetchEveryInfraPage = async (
  url: string,
  platform: 'wechat_oa' | 'xiaohongshu',
  signal?: AbortSignal,
): Promise<string> => {
  const { EVERYINFRA_API_KEY: apiKey } = getServerEnv();
  if (!apiKey) {
    return 'Error: EVERYINFRA_API_KEY is not set';
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 120_000);
  const abortRequest = () => controller.abort();
  signal?.addEventListener('abort', abortRequest);

  try {
    let articleUrl = new URL(url);
    if (platform === 'xiaohongshu' && articleUrl.hostname === 'xhslink.com') {
      for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
        const response = await fetch(articleUrl, {
          redirect: 'manual',
          signal: controller.signal,
        });
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (response.status < 300 || response.status >= 400 || !location) {
          return `Error: Xiaohongshu share URL returned HTTP ${response.status} without a redirect`;
        }

        articleUrl = new URL(location, articleUrl);
        if (!isSafePlatformUrl(articleUrl)) {
          return 'Error: Xiaohongshu share URL redirected to an unsupported URL';
        }
        const noteUrl = getXiaohongshuNoteUrl(articleUrl);
        if (noteUrl) {
          articleUrl = new URL(noteUrl);
          break;
        }
        if (articleUrl.hostname !== 'xhslink.com') {
          return 'Error: Xiaohongshu share URL did not resolve to a supported note URL';
        }
      }
      if (!getXiaohongshuNoteUrl(articleUrl)) {
        return 'Error: Xiaohongshu share URL exceeded 3 redirects';
      }
    }

    const response = await fetch('https://api.everyinfra.com/api/v1/social', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform,
        action: platform === 'wechat_oa' ? 'article_detail' : 'note',
        params: { url: articleUrl.href },
      }),
      redirect: 'manual',
      signal: controller.signal,
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
      return `Error: EveryInfra HTTP ${response.status} returned invalid JSON`;
    }

    const contentResponse = z
      .object({
        results: z.record(z.string(), z.unknown()).nullish(),
        error: z
          .object({ code: z.string(), message: z.string(), request_id: z.string().optional() })
          .optional(),
      })
      .safeParse(payload);
    if (!response.ok || (contentResponse.success && contentResponse.data.error)) {
      const error = contentResponse.success ? contentResponse.data.error : undefined;
      return `Error: EveryInfra HTTP ${response.status}${error ? ` (${[error.code, error.message, error.request_id].filter(Boolean).join(', ')})` : ''}`;
    }
    if (
      !contentResponse.success ||
      !contentResponse.data.results ||
      Object.keys(contentResponse.data.results).length === 0
    ) {
      return 'Error: EveryInfra returned no page content';
    }
    const page = contentResponse.data.results;
    const bodyText = platform === 'wechat_oa' ? page.content_text : page.text;
    if (
      !(typeof bodyText === 'string' && bodyText.trim()) &&
      !(
        platform === 'xiaohongshu' &&
        Array.isArray(page.images) &&
        page.images.some((image) => typeof image === 'string' && image.trim())
      )
    ) {
      return 'Error: EveryInfra returned no page content';
    }
    delete page.content_html;
    return JSON.stringify(page, null, 2);
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (timedOut) {
      return 'Error: EveryInfra request timed out';
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortRequest);
    clearTimeout(timeoutId);
  }
};

type PageFetchResult = { ok: true; content: string } | { ok: false; error: string };

const fetchMarkdownWithParallel = async (
  url: string,
  signal?: AbortSignal,
): Promise<PageFetchResult> => {
  signal?.throwIfAborted();

  const { PARALLEL_API_KEY } = getServerEnv();
  if (!PARALLEL_API_KEY) {
    return { ok: false, error: 'PARALLEL_API_KEY is not set' };
  }

  const timeoutSignal = AbortSignal.timeout(80_000);

  try {
    const response = await fetch('https://api.parallel.ai/v1/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PARALLEL_API_KEY,
      },
      body: JSON.stringify({
        urls: [url],
        advanced_settings: {
          full_content: true,
          fetch_policy: {
            max_age_seconds: 600,
            timeout_seconds: 60,
            disable_cache_fallback: true,
          },
        },
      }),
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Parallel HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`,
      };
    }

    const result = z
      .object({
        extract_id: z.string(),
        results: z.array(
          z.object({
            full_content: z.string().nullable().optional(),
            excerpts: z.array(z.string()),
          }),
        ),
        errors: z.array(
          z.object({
            error_type: z.string(),
            http_status_code: z.number().nullable(),
            content: z.string().nullable(),
          }),
        ),
      })
      .parse(await response.json());

    if (result.errors[0]) {
      const error = result.errors[0];
      return {
        ok: false,
        error: `Parallel ${error.error_type}${error.http_status_code === null ? '' : ` HTTP ${error.http_status_code}`}${error.content === null ? '' : `: ${error.content}`} (extract_id ${result.extract_id})`,
      };
    }

    const page = result.results[0];
    const content = page?.full_content?.trim()
      ? page.full_content
      : page?.excerpts.filter((excerpt) => excerpt.trim()).join('\n\n');
    if (!content?.trim()) {
      return { ok: false, error: `Parallel returned no page content (${result.extract_id})` };
    }

    return { ok: true, content };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    if (timeoutSignal.aborted) {
      return { ok: false, error: 'Parallel request timed out' };
    }
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof z.ZodError) {
      return { ok: false, error: `Parallel request failed: ${error.message}` };
    }
    throw error;
  }
};

const fetchMarkdownWithJina = async (
  url: string,
  signal?: AbortSignal,
): Promise<PageFetchResult> => {
  signal?.throwIfAborted();

  const { JINA_API_KEY } = getServerEnv();
  if (!JINA_API_KEY) {
    return { ok: false, error: 'JINA_API_KEY is not set' };
  }

  const timeoutSignal = AbortSignal.timeout(80_000);

  try {
    const response = await fetch('https://r.jina.ai/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Respond-With': 'markdown',
        'X-Timeout': '60',
        'X-Cache-Tolerance': '600',
      },
      body: JSON.stringify({ url }),
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Jina HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`,
      };
    }

    const { data } = z
      .object({ data: z.object({ content: z.string() }) })
      .parse(await response.json());
    if (!data.content.trim()) {
      return { ok: false, error: 'Jina returned no page content' };
    }

    return { ok: true, content: data.content };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    if (timeoutSignal.aborted) {
      return { ok: false, error: 'Jina request timed out' };
    }
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof z.ZodError) {
      return { ok: false, error: `Jina request failed: ${error.message}` };
    }
    throw error;
  }
};

const fetchMarkdown = async (url: string, signal?: AbortSignal): Promise<string> => {
  const parallel = await fetchMarkdownWithParallel(url, signal);
  signal?.throwIfAborted();
  if (parallel.ok) {
    return parallel.content;
  }

  log('FETCH', 'Parallel failed; retrying with Jina', { url, error: parallel.error });
  const jina = await fetchMarkdownWithJina(url, signal);
  signal?.throwIfAborted();
  if (jina.ok) {
    log('FETCH', 'Jina retry completed', { url });
    return jina.content;
  }

  log('FETCH', 'Parallel and Jina failed', { url, parallel: parallel.error, jina: jina.error });
  return `Error: ${parallel.error}; ${jina.error}`;
};

const fetchUrl: ToolHandler = async (args, signal) => {
  const { url } = z.object({ url: z.string().url() }).strict().parse(args);
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('fetch_url requires an HTTP or HTTPS URL');
  }
  signal?.throwIfAborted();

  if (
    isSafePlatformUrl(parsedUrl) &&
    parsedUrl.hostname === 'mp.weixin.qq.com' &&
    (parsedUrl.pathname === '/s' || parsedUrl.pathname.startsWith('/s/'))
  ) {
    parsedUrl.hash = '';
    return fetchEveryInfraPage(parsedUrl.href, 'wechat_oa', signal);
  }

  const xiaohongshuNoteUrl = getXiaohongshuNoteUrl(parsedUrl);
  if (xiaohongshuNoteUrl) {
    return fetchEveryInfraPage(xiaohongshuNoteUrl, 'xiaohongshu', signal);
  }

  if (
    isSafePlatformUrl(parsedUrl) &&
    parsedUrl.hostname === 'xhslink.com' &&
    parsedUrl.pathname !== '/'
  ) {
    parsedUrl.hash = '';
    return fetchEveryInfraPage(parsedUrl.href, 'xiaohongshu', signal);
  }

  const redditPostId = getRedditPostId(parsedUrl);
  if (redditPostId) {
    return enqueueFetchUrlCall(() =>
      fetchMarkdown(`https://www.reddit.com/comments/${redditPostId}/`, signal),
    );
  }

  if (isRedditShareUrl(parsedUrl)) {
    const resolution = await resolveRedditSharePostId(parsedUrl, signal);
    if (!resolution.ok) {
      return `Error: ${resolution.error}`;
    }

    return enqueueFetchUrlCall(() =>
      fetchMarkdown(`https://www.reddit.com/comments/${resolution.postId}/`, signal),
    );
  }

  return enqueueFetchUrlCall(() => fetchMarkdown(url, signal));
};

const fetchUrlSpec: ChatTool = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Read text content from a webpage URL, including WeChat articles, Xiaohongshu/RedNote notes and Reddit posts. Use read_image for images and read_youtube_transcript for YouTube transcripts.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { url: { type: 'string', description: 'The webpage or article URL to read' } },
      required: ['url'],
    },
  },
};

export const fetchUrlTool: ToolDefinition = {
  spec: fetchUrlSpec,
  handler: fetchUrl,
};
