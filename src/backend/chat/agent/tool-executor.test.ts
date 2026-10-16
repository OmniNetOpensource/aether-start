import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAvailableTools } from './tool-executor';

afterEach(() => {
  vi.unstubAllEnvs();
});

const availableToolNames = () => getAvailableTools().map((tool) => tool.function.name);

describe('getAvailableTools', () => {
  it('exposes search when only EVERYINFRA_API_KEY is configured', () => {
    vi.stubEnv('SERP_API_KEY', '');
    vi.stubEnv('EVERYINFRA_API_KEY', 'test-token');

    expect(availableToolNames()).toContain('search');
  });

  it('exposes search when only SERP_API_KEY is configured', () => {
    vi.stubEnv('SERP_API_KEY', 'test-key');
    vi.stubEnv('EVERYINFRA_API_KEY', '');

    expect(availableToolNames()).toContain('search');
  });

  it('hides search when only the legacy fetch credential is configured', () => {
    vi.stubEnv('JUSTONEAPI_TOKEN', 'legacy-token');
    vi.stubEnv('SERP_API_KEY', '');
    vi.stubEnv('EVERYINFRA_API_KEY', '');

    expect(availableToolNames()).not.toContain('search');
  });
});
