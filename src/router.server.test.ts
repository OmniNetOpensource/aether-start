// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { getRouter } from './router';

describe('server router query state', () => {
  it('creates an isolated query client for every request', () => {
    const firstRouter = getRouter();
    const secondRouter = getRouter();
    const firstQueryClient = firstRouter.options.context.queryClient;
    const secondQueryClient = secondRouter.options.context.queryClient;

    expect(firstQueryClient).not.toBe(secondQueryClient);
    firstQueryClient.setQueryData(['conversations'], ['private conversation']);
    expect(secondQueryClient.getQueryData(['conversations'])).toBeUndefined();
    expect(firstRouter.options.dehydrate).toBeTypeOf('function');
    expect(firstRouter.options.Wrap).toBeTypeOf('function');

    firstQueryClient.clear();
    secondQueryClient.clear();
  });
});
