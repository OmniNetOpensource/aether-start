import { queryOptions } from '@tanstack/react-query';
import { getAvailableModelsFn } from '@/rpc/chat-options';

export const availableModelsQueryOptions = queryOptions({
  queryKey: ['chat-options', 'models'],
  queryFn: () => getAvailableModelsFn(),
  staleTime: Infinity,
  gcTime: Infinity,
});
