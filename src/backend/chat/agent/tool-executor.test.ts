import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAvailableTools } from './tool-executor';

afterEach(() => {
  vi.unstubAllEnvs();
});

const availableToolNames = () => getAvailableTools().map((tool) => tool.function.name);

describe('getAvailableTools', () => {
  it('exposes search when only JUSTONEAPI_TOKEN is configured', () => {
    vi.stubEnv('SERP_API_KEY', '');
    vi.stubEnv('JUSTONEAPI_TOKEN', 'test-token');

    expect(availableToolNames()).toContain('search');
  });

  it('exposes search when only SERP_API_KEY is configured', () => {
    vi.stubEnv('SERP_API_KEY', 'test-key');
    vi.stubEnv('JUSTONEAPI_TOKEN', '');

    expect(availableToolNames()).toContain('search');
  });

  it('hides search when neither credential is configured', () => {
    vi.stubEnv('SERP_API_KEY', '');
    vi.stubEnv('JUSTONEAPI_TOKEN', '');

    expect(availableToolNames()).not.toContain('search');
  });
});
