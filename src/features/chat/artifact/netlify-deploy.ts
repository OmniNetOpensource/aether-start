import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const inputSchema = z.object({ html: z.string().min(1) });
const createSiteSchema = z.object({ id: z.string() });
const createDeploySchema = z.object({ id: z.string() });
const uploadFileSchema = z.object({ mime_type: z.string().optional() });
const deployStatusSchema = z.object({
  state: z.string(),
  url: z.string().optional(),
  ssl_url: z.string().optional(),
  error_message: z.string().nullable().optional(),
});

const NETLIFY_API_BASE_URL = 'https://api.netlify.com/api/v1';
const NETLIFY_POLL_INTERVAL_MS = 500;
const NETLIFY_TIMEOUT_MS = 30_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toHex = (bytes: Uint8Array) =>
  bytes.reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '');

const sha1 = async (bytes: Uint8Array) => {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest('SHA-1', input);
  return toHex(new Uint8Array(digest));
};

const getResponseText = async (response: Response, label: string) => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Netlify ${label} failed: ${response.status} ${text}`);
  }
  return text;
};

const parseJson = <T>(text: string, schema: z.ZodType<T>, label: string) => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Netlify ${label}: invalid JSON response`);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Netlify ${label}: unexpected response`);
  }
  return parsed.data;
};

export async function deployHtmlToNetlify({
  html,
  netlifyToken,
  fetchImpl = fetch,
  sleep = wait,
  pollIntervalMs = NETLIFY_POLL_INTERVAL_MS,
  timeoutMs = NETLIFY_TIMEOUT_MS,
}: {
  html: string;
  netlifyToken: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}) {
  const htmlBytes = new TextEncoder().encode(html);
  const htmlSha1 = await sha1(htmlBytes);

  const siteResponse = await fetchImpl(`${NETLIFY_API_BASE_URL}/sites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${netlifyToken}`,
    },
    body: '{}',
  });
  const site = parseJson(
    await getResponseText(siteResponse, 'create site'),
    createSiteSchema,
    'create site',
  );

  const deployResponse = await fetchImpl(`${NETLIFY_API_BASE_URL}/sites/${site.id}/deploys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${netlifyToken}`,
    },
    body: JSON.stringify({
      files: {
        '/index.html': htmlSha1,
      },
    }),
  });
  const deploy = parseJson(
    await getResponseText(deployResponse, 'create deploy'),
    createDeploySchema,
    'create deploy',
  );

  const uploadResponse = await fetchImpl(
    `${NETLIFY_API_BASE_URL}/deploys/${deploy.id}/files/index.html`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${netlifyToken}`,
      },
      body: htmlBytes,
    },
  );
  parseJson(await getResponseText(uploadResponse, 'upload file'), uploadFileSchema, 'upload file');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statusResponse = await fetchImpl(
      `${NETLIFY_API_BASE_URL}/sites/${site.id}/deploys/${deploy.id}`,
      {
        headers: {
          Authorization: `Bearer ${netlifyToken}`,
        },
      },
    );
    const status = parseJson(
      await getResponseText(statusResponse, 'get deploy status'),
      deployStatusSchema,
      'get deploy status',
    );

    if (status.state === 'ready') {
      const publicUrl = status.ssl_url ?? status.url;
      if (!publicUrl) {
        throw new Error('Netlify deploy: response missing url');
      }
      return { url: publicUrl, htmlBytes: htmlBytes.length, sha1: htmlSha1 };
    }

    if (status.state === 'error') {
      throw new Error(status.error_message ?? 'Netlify deploy failed');
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Netlify deploy timed out');
}

export const deployToNetlifyFn = createServerFn({ method: 'POST' })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    const [{ requireSession }, { log }, { getServerEnv }] = await Promise.all([
      import('@/features/auth/session/request.server'),
      import('@/features/chat/agent-runtime/logger.server'),
      import('@/shared/worker/env.server'),
    ]);
    await requireSession();

    const { NETIFY_TOKEN } = getServerEnv();
    if (!NETIFY_TOKEN) {
      log('NETLIFY_DEPLOY', 'missing_token', {});
      throw new Error('Netlify 未配置');
    }

    log('NETLIFY_DEPLOY', 'request_start', {});

    try {
      const result = await deployHtmlToNetlify({
        html: data.html,
        netlifyToken: NETIFY_TOKEN,
      });
      log('NETLIFY_DEPLOY', 'deploy_ok', {
        url: result.url,
        htmlBytes: result.htmlBytes,
        sha1: result.sha1,
      });
      return { url: result.url };
    } catch (error) {
      log('NETLIFY_DEPLOY', 'deploy_error', { error });
      throw error;
    }
  });
