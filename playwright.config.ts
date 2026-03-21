import { defineConfig } from '@playwright/test';

const useWebServer = process.env.E2E_WEB_SERVER === '1';
const e2ePort = process.env.E2E_PORT ?? '3010';
const baseURL =
  process.env.E2E_BASE_URL ??
  (useWebServer ? `http://127.0.0.1:${e2ePort}` : 'http://localhost:3000');
const webServerURL = new URL(baseURL);
const webServerPort =
  webServerURL.port || (webServerURL.protocol === 'https:' ? '443' : '80');
const e2eOrigins = [webServerURL.origin];

if (webServerURL.hostname === '127.0.0.1') {
  e2eOrigins.push(`http://localhost:${webServerPort}`);
}

if (webServerURL.hostname === 'localhost') {
  e2eOrigins.push(`http://127.0.0.1:${webServerPort}`);
}

const trustedOrigins = Array.from(
  new Set(
    [
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((value) => value.trim()) ?? []),
      ...e2eOrigins,
    ].filter((value) => value.length > 0),
  ),
).join(',');

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 120_000,
  ...(useWebServer
    ? {
        webServer: {
          command: `pnpm exec vite dev --host ${webServerURL.hostname} --port ${webServerPort}`,
          env: {
            ...process.env,
            BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
          },
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  use: {
    baseURL,
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'on-first-retry',
  },
});
