import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { getQueryClient } from '@/frontend/conversations/session';

// Import the generated route tree
import { routeTree } from './routeTree.gen';

// Create a new router instance
export const getRouter = () => {
  const queryClient = getQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },

    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
