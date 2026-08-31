import { QueryClient, environmentManager } from '@tanstack/react-query';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });

let browserQueryClient: QueryClient | undefined;

export const getQueryClient = () => {
  if (environmentManager.isServer()) {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
};
