import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { deployArtifactAndSaveDeployment, deployHtmlToNetlify } from './netlify-deploy.ts';

const jsonResponse = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const getRequestUrl = (input: string | URL | Request) => {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
};

const getRequestMethod = (input: string | URL | Request, init: RequestInit | undefined) => {
  if (init?.method) {
    return init.method;
  }

  if (typeof input === 'string' || input instanceof URL) {
    return 'GET';
  }

  return input.method;
};

const getRequestHeaders = (input: string | URL | Request, init: RequestInit | undefined) => {
  if (init?.headers) {
    return new Headers(init.headers);
  }

  if (typeof input === 'string' || input instanceof URL) {
    return new Headers();
  }

  return input.headers;
};

test('deployHtmlToNetlify uploads index.html with file-digest flow and waits for ready', async () => {
  const html = '<!doctype html><html><head><title>deploy</title></head><body>ok</body></html>';
  const expectedSha1 = createHash('sha1').update(html).digest('hex');
  const calls: Array<{
    url: string;
    method: string;
    headers: Headers;
    body: RequestInit['body'];
  }> = [];

  const responses = [
    jsonResponse({ id: 'site-123' }),
    jsonResponse({ id: 'deploy-456' }),
    jsonResponse({ mime_type: 'text/html; charset=utf-8' }),
    jsonResponse({ state: 'processing', url: 'http://processing.example' }),
    jsonResponse({
      state: 'ready',
      url: 'http://ready.example',
      ssl_url: 'https://ready.example',
    }),
  ];

  const result = await deployHtmlToNetlify({
    html,
    netlifyToken: 'token-123',
    fetchImpl: async (input, init) => {
      const url = getRequestUrl(input);
      const method = getRequestMethod(input, init);
      const headers = getRequestHeaders(input, init);
      calls.push({ url, method, headers, body: init?.body });

      const response = responses.shift();
      assert.ok(response, `unexpected fetch: ${method} ${url}`);
      return response;
    },
    sleep: async () => {},
    pollIntervalMs: 1,
    timeoutMs: 10,
  });

  assert.equal(result.url, 'https://ready.example');
  assert.equal(calls.length, 5);

  assert.equal(calls[0]?.url, 'https://api.netlify.com/api/v1/sites');
  assert.equal(calls[0]?.method, 'POST');
  assert.equal(calls[0]?.headers.get('content-type'), 'application/json');
  assert.equal(calls[0]?.headers.get('authorization'), 'Bearer token-123');
  assert.equal(calls[0]?.body, '{}');

  assert.equal(calls[1]?.url, 'https://api.netlify.com/api/v1/sites/site-123/deploys');
  assert.equal(calls[1]?.method, 'POST');
  assert.equal(calls[1]?.headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(calls[1]?.body)), {
    files: {
      '/index.html': expectedSha1,
    },
  });

  assert.equal(calls[2]?.url, 'https://api.netlify.com/api/v1/deploys/deploy-456/files/index.html');
  assert.equal(calls[2]?.method, 'PUT');
  assert.equal(calls[2]?.headers.get('content-type'), 'application/octet-stream');
  assert.equal(
    new TextDecoder().decode(
      calls[2]?.body instanceof Uint8Array ? calls[2].body : new Uint8Array(),
    ),
    html,
  );

  assert.equal(calls[3]?.url, 'https://api.netlify.com/api/v1/sites/site-123/deploys/deploy-456');
  assert.equal(calls[3]?.method, 'GET');
  assert.equal(calls[4]?.url, 'https://api.netlify.com/api/v1/sites/site-123/deploys/deploy-456');
  assert.equal(calls[4]?.method, 'GET');
});

test('deployArtifactAndSaveDeployment persists deploy metadata after a successful deploy', async () => {
  const persisted: Array<{
    artifactId: string;
    deployUrl: string;
    deployedAt: string;
  }> = [];

  const result = await deployArtifactAndSaveDeployment({
    artifactId: 'artifact-123',
    html: '<!doctype html><html><body>ok</body></html>',
    deploy: async (html) => {
      assert.match(html, /<!doctype html>/i);
      return { url: 'https://deploy.example' };
    },
    persist: async (deployment) => {
      persisted.push(deployment);
    },
    now: () => '2026-03-30T12:34:56.000Z',
  });

  assert.deepEqual(persisted, [
    {
      artifactId: 'artifact-123',
      deployUrl: 'https://deploy.example',
      deployedAt: '2026-03-30T12:34:56.000Z',
    },
  ]);
  assert.deepEqual(result, {
    url: 'https://deploy.example',
    deployed_at: '2026-03-30T12:34:56.000Z',
  });
});

test('deployArtifactAndSaveDeployment does not persist deploy metadata when deploy fails', async () => {
  let persisted = false;

  await assert.rejects(
    deployArtifactAndSaveDeployment({
      artifactId: 'artifact-123',
      html: '<!doctype html><html><body>ok</body></html>',
      deploy: async () => {
        throw new Error('deploy failed');
      },
      persist: async () => {
        persisted = true;
      },
      now: () => '2026-03-30T12:34:56.000Z',
    }),
    /deploy failed/,
  );

  assert.equal(persisted, false);
});
