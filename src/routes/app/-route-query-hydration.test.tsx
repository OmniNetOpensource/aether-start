import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider, dehydrate, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRouter } from '@/router';
import {
  availableModelsQueryOptions,
  selectAllConversations,
  useConversationsQuery,
} from '@/frontend/conversations/session';
import { Route } from './route';

const rpc = vi.hoisted(() => ({
  listConversations: vi.fn(),
  getAvailableModels: vi.fn(),
}));

vi.mock('@/rpc/conversations', async () => ({
  ...(await vi.importActual<typeof import('@/rpc/conversations')>('@/rpc/conversations')),
  listConversationsPageFn: rpc.listConversations,
}));

vi.mock('@/rpc/chat-options', () => ({
  getAvailableModelsFn: rpc.getAvailableModels,
}));

const title = '服务端预取的会话';
const modelName = '服务端预取的模型';

function ConversationProbe() {
  const conversations = useConversationsQuery();
  if (conversations.isLoading) return <p>加载会话中…</p>;
  return <p>{selectAllConversations(conversations.data)[0]?.title}</p>;
}

function RouteDataProbe() {
  const models = useQuery(availableModelsQueryOptions);
  return (
    <>
      <ConversationProbe />
      <p>{models.data?.[0]?.name}</p>
    </>
  );
}

beforeEach(() => {
  rpc.listConversations.mockResolvedValue({
    items: [
      {
        id: 'conversation-1',
        title,
        model: 'model-1',
        is_pinned: false,
        pinned_at: null,
        created_at: '2026-08-31T00:00:00.000Z',
        updated_at: '2026-08-31T00:00:00.000Z',
        user_id: 'user-1',
      },
    ],
    nextCursor: null,
  });
  rpc.getAvailableModels.mockResolvedValue([{ id: 'model-1', name: modelName }]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('app route query hydration', () => {
  it('hydrates the prefetched route queries before the first client render', async () => {
    const serverQueryClient = new QueryClient();
    const loader = Reflect.get(Route.options, 'loader');
    if (typeof loader !== 'function') throw new Error('App route has no loader');

    await Reflect.apply(loader, undefined, [{ context: { queryClient: serverQueryClient } }]);
    expect(serverQueryClient.getQueryState(['conversations'])?.status).toBe('success');
    expect(serverQueryClient.getQueryData(['chat-options', 'models'])).toEqual([
      { id: 'model-1', name: modelName },
    ]);

    const serverHtml = renderToString(
      <QueryClientProvider client={serverQueryClient}>
        <RouteDataProbe />
      </QueryClientProvider>,
    );
    expect(serverHtml).toContain(title);
    expect(serverHtml).toContain(modelName);

    const clientRouter = getRouter();
    const clientQueryClient = clientRouter.options.context.queryClient;
    clientQueryClient.clear();
    const hydrate = clientRouter.options.hydrate;
    if (typeof hydrate !== 'function') throw new Error('Router query hydration is not installed');

    await Reflect.apply(hydrate, clientRouter, [
      {
        dehydratedQueryClient: dehydrate(serverQueryClient),
        queryStream: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      },
    ]);
    expect(clientQueryClient.getQueryData(['chat-options', 'models'])).toEqual([
      { id: 'model-1', name: modelName },
    ]);

    const Wrap = clientRouter.options.Wrap;
    if (!Wrap) throw new Error('Router query provider is not installed');
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const recoverableErrors: unknown[] = [];
    let hydrationRoot: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      hydrationRoot = hydrateRoot(
        container,
        <Wrap>
          <RouteDataProbe />
        </Wrap>,
        {
          onRecoverableError(error) {
            recoverableErrors.push(error);
          },
        },
      );
    });

    expect(container.textContent).toBe(`${title}${modelName}`);
    expect(recoverableErrors).toEqual([]);
    expect(rpc.getAvailableModels).toHaveBeenCalledTimes(1);

    await act(async () => hydrationRoot?.unmount());
    container.remove();
    serverQueryClient.clear();
    clientQueryClient.clear();
  });
});
