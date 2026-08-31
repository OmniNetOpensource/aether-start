import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  listConversationsPageFn,
  deleteConversationFn,
  setConversationPinnedFn,
  updateConversationTitleFn,
  clearConversationsFn,
} from '@/rpc/conversations';
import type { ConversationListCursor, ConversationMeta } from '@/shared/conversations/conversation';
import { getQueryClient } from './query-client';

const PAGE_SIZE = 10;

export const conversationListQueryKey = ['conversations'];

type ConversationPage = {
  items: ConversationMeta[];
  nextCursor: ConversationListCursor;
};

type ConversationListData = InfiniteData<ConversationPage, ConversationListCursor>;

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

export const selectAllConversations = (
  data: { pages: ConversationPage[] } | undefined,
): ConversationMeta[] => {
  if (!data) return [];
  const all = data.pages.flatMap((page) => page.items);
  return sortConversations(all);
};

export const conversationInfiniteQueryOptions = infiniteQueryOptions({
  queryKey: conversationListQueryKey,
  queryFn: async ({ pageParam }: { pageParam: ConversationListCursor }) => {
    const page = await listConversationsPageFn({
      data: { limit: PAGE_SIZE, cursor: pageParam },
    });
    return {
      items: page.items.map(
        (conversation): ConversationMeta => ({
          id: conversation.id,
          title: conversation.title,
          model: conversation.model,
          is_pinned: conversation.is_pinned,
          pinned_at: conversation.pinned_at,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
          user_id: conversation.user_id,
        }),
      ),
      nextCursor: page.nextCursor,
    } satisfies ConversationPage;
  },
  initialPageParam: null,
  getNextPageParam: (lastPage: ConversationPage) => lastPage.nextCursor,
});

export function useConversationsQuery() {
  return useInfiniteQuery(conversationInfiniteQueryOptions);
}

// -- Mutations --

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConversationFn({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: conversationListQueryKey });
      const previous = queryClient.getQueryData<ConversationListData>(conversationListQueryKey);
      queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
          })),
        };
      });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      setConversationPinnedFn({ data: { id, pinned } }),
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries({ queryKey: conversationListQueryKey });
      const previous = queryClient.getQueryData<ConversationListData>(conversationListQueryKey);
      queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
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
      });
      return { previous };
    },
    onSuccess: (result, { id, pinned }) => {
      queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
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
      });
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(conversationListQueryKey, context.previous);
      }
    },
  });
}

export function useUpdateConversationTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string | null }) =>
      updateConversationTitleFn({ data: { id, title } }),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: conversationListQueryKey });
      const previous = queryClient.getQueryData<ConversationListData>(conversationListQueryKey);
      queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id ? { ...item, title } : item)),
          })),
        };
      });
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearConversationsFn(),
    onSuccess: () => {
      queryClient.setQueryData<ConversationListData>(conversationListQueryKey, {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [null],
      });
    },
  });
}

// -- Imperative cache helper for non-React code --

export function upsertConversationInCache(conversation: ConversationMeta) {
  const queryClient = getQueryClient();
  queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
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
  });
}

/** 只更新缓存里已有条目的标题和 updated_at，保留 pinned 等其余字段；条目不存在时不动缓存 */
export function updateConversationTitleInCache(id: string, title: string, updatedAt: string) {
  const queryClient = getQueryClient();
  queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((item) =>
          item.id === id ? { ...item, title, updated_at: updatedAt } : item,
        ),
      })),
    };
  });
}

export function removeConversationFromCache(conversationId: string) {
  const queryClient = getQueryClient();
  queryClient.setQueryData<ConversationListData>(conversationListQueryKey, (old) => {
    if (!old) {
      return old;
    }

    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== conversationId),
      })),
    };
  });
}
