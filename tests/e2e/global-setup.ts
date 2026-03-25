import { request, type FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  const baseURL = String(config.projects[0]?.use?.baseURL ?? 'http://localhost:3000');
  const origin = new URL(baseURL).origin;
  const email = process.env.E2E_EMAIL ?? process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_PASSWORD ?? process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD (or E2E_USER_EMAIL and E2E_USER_PASSWORD)');
  }

  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      origin,
      referer: `${origin}/auth/login`,
    },
  });

  const response = await api.post('/api/auth/sign-in/email', {
    data: {
      email,
      password,
    },
  });

  if (!response.ok()) {
    throw new Error(`E2E login failed (${response.status()}): ${await response.text()}`);
  }

  await api.storageState({ path: 'tests/e2e/.auth/state.json' });
  await api.dispose();
}
