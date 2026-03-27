import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  listConversationsPageFn,
  deleteConversationFn,
  setConversationPinnedFn,
  updateConversationTitleFn,
  clearConversationsFn,
  type ConversationListCursor,
} from '@/features/sidebar/server/conversations';
import type { ConversationDetail, ConversationMeta } from '@/features/sidebar/types/conversation';
import { queryClient } from './query-client';

const PAGE_SIZE = 10;

export const conversationListQueryKey = ['conversations'];

type ConversationPage = {
  items: ConversationMeta[];
  nextCursor: ConversationListCursor;
};

const sortConversations = (conversations: ConversationMeta[]): ConversationMeta[] => {
  const sorted = [...conversations];
  sorted.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }

    const aSortAt = a.is_pinned ? (a.pinned_at ?? a.updated_at) : a.updated_at;
    const bSortAt = b.is_pinned ? (b.pinned_at ?? b.updated_at) : b.updated_at;
    const bySortAt = bSortAt.localeCompare(aSortAt);

    if (bySortAt !== 0) {
      return bySortAt;
    }

    const byUpdated = b.updated_at.localeCompare(a.updated_at);
    if (byUpdated !== 0) {
      return byUpdated;
    }

    return b.id.localeCompare(a.id);
  });

  return sorted;
};

const mapDetailToMeta = (detail: ConversationDetail): ConversationMeta => ({
  id: detail.id,
  title: detail.title,
  model: detail.model,
  is_pinned: detail.is_pinned,
  pinned_at: detail.pinned_at,
  created_at: detail.created_at,
  updated_at: detail.updated_at,
  user_id: detail.user_id,
});

export const selectAllConversations = (
  data: { pages: ConversationPage[] } | undefined,
): ConversationMeta[] => {
  if (!data) return [];
  const all = data.pages.flatMap((page) => page.items);
  return sortConversations(all);
};

export const conversationInfiniteQueryOptions = {
  queryKey: conversationListQueryKey,
  queryFn: async ({ pageParam }: { pageParam: ConversationListCursor }) => {
    const page = await listConversationsPageFn({
      data: { limit: PAGE_SIZE, cursor: pageParam },
    });
    return {
      items: (page.items as ConversationDetail[]).map(mapDetailToMeta),
      nextCursor: page.nextCursor,
    } satisfies ConversationPage;
  },
  initialPageParam: null as ConversationListCursor,
  getNextPageParam: (lastPage: ConversationPage) => lastPage.nextCursor,
};

export function useConversationsQuery() {
  return useInfiniteQuery(conversationInfiniteQueryOptions);
}

// -- Mutations --

export function useDeleteConversation() {
  return useMutation({
    mutationFn: (id: string) => deleteConversationFn({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: conversationListQueryKey });
      const previous = queryClient.getQueryData<{ pages: ConversationPage[] }>(
        conversationListQueryKey,
      );
      queryClient.setQueryData<{ pages: ConversationPage[]; pageParams: ConversationListCursor[] }>(
        conversationListQueryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== id),
            })),
          };
        },
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationListQueryKey, context.previous);
      }
    },
  });
}

export function useSetConversationPinned() {
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      setConversationPinnedFn({ data: { id, pinned } }),
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries({ queryKey: conversationListQueryKey });
      const previous = queryClient.getQueryData<{ pages: ConversationPage[] }>(
        conversationListQueryKey,
      );
      queryClient.setQueryData<{ pages: ConversationPage[]; pageParams: ConversationListCursor[] }>(
        conversationListQueryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      is_pinned: pinned,
                      pinned_at: pinned ? new Date().toISOString() : null,
                    }
                  : item,
              ),
            })),
          };
        },
      );
      return { previous };
    },
    onSuccess: (result, { id, pinned }) => {
      queryClient.setQueryData<{ pages: ConversationPage[]; pageParams: ConversationListCursor[] }>(
        conversationListQueryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === id ? { ...item, pinned_at: pinned ? result.pinned_at : null } : item,
              ),
            })),
          };
        },
      );
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationListQueryKey, context.previous);
      }
    },
  });
}

export function useUpdateConversationTitle() {
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string | null }) =>
      updateConversationTitleFn({ data: { id, title } }),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: conversationListQueryKey });
      const previous = queryClient.getQueryData<{ pages: ConversationPage[] }>(
        conversationListQueryKey,
      );
      queryClient.setQueryData<{ pages: ConversationPage[]; pageParams: ConversationListCursor[] }>(
        conversationListQueryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === id ? { ...item, title } : item)),
            })),
          };
        },
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationListQueryKey, context.previous);
      }
    },
  });
}

export function useClearConversations() {
  return useMutation({
    mutationFn: () => clearConversationsFn(),
    onSuccess: () => {
      queryClient.setQueryData<{ pages: ConversationPage[]; pageParams: ConversationListCursor[] }>(
        conversationListQueryKey,
        {
          pages: [{ items: [], nextCursor: null }],
          pageParams: [null],
        },
      );
    },
  });
}

// -- Imperative cache helper for non-React code --

export function upsertConversationInCache(conversation: ConversationMeta) {
  queryClient.setQueryData<{ pages: ConversationPage[]; pageParams: ConversationListCursor[] }>(
    conversationListQueryKey,
    (old) => {
      if (!old) {
        return {
          pages: [{ items: [conversation], nextCursor: null }],
          pageParams: [null],
        };
      }

      // Remove existing entry from all pages
      const withoutExisting = old.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== conversation.id),
      }));

      // Insert/update into page 0
      const firstPage = withoutExisting[0];
      return {
        ...old,
        pages: [
          { ...firstPage, items: [conversation, ...firstPage.items] },
          ...withoutExisting.slice(1),
        ],
      };
    },
  );
}
