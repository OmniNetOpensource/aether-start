import { lazy, Suspense } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  DEFAULT_MODEL_ID,
  getAvailableModelsFn,
  getAvailablePromptsFn,
} from '@/features/chat/model-catalog';
import { type AppShellRouteData } from '@/features/conversations/route-data';
import { queryClient } from '@/features/conversations/session';
import { conversationInfiniteQueryOptions } from '@/features/conversations/session';
import { loadWithRetry } from '@/shared/browser/load-with-retry';
import { AppLoading } from '@/shared/app-shell/AppLoading';

const AppLayout = lazy(() => loadWithRetry(() => import('@/routes/app/-AppLayout')));

export const Route = createFileRoute('/app')({
  loader: async (): Promise<AppShellRouteData> => {
    const [availableModels, availablePrompts] = await Promise.all([
      getAvailableModelsFn(),
      getAvailablePromptsFn(),
      queryClient.prefetchInfiniteQuery(conversationInfiniteQueryOptions),
    ]);

    return {
      availableModels,
      availablePrompts,
      initialModelId: DEFAULT_MODEL_ID,
      initialPromptId: availablePrompts[0]?.id ?? 'aether',
    };
  },
  component: AppRoute,
});

function AppRoute() {
  return (
    <Suspense fallback={<AppLoading />}>
      <AppLayout />
    </Suspense>
  );
}
