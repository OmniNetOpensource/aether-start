import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { ConversationMeta } from "@/features/conversation/model/types/conversation";
import type { ConversationDetail } from "@/features/conversation/model/types/conversation";
import {
  listConversationsPageFn,
  clearConversationsFn,
  deleteConversationFn,
  updateConversationTitleFn,
} from "@/features/conversation/persistence/server/functions/conversations";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";

type ConversationsState = {
  conversations: ConversationMeta[];
  conversationsLoading: boolean;
  hasLoaded: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  conversationsCursor: { updated_at: string; id: string } | null;
};

type ConversationsActions = {
  addConversation: (conversation: ConversationMeta) => void;
  setConversations: (conversations: ConversationMeta[]) => void;
  loadInitialConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  clear: () => Promise<void>;
  reset: () => void;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
};

const PAGE_SIZE = 10;

const sortByUpdatedAt = (conversations: ConversationMeta[]): ConversationMeta[] => {
  const sorted = [...conversations];
  sorted.sort((a, b) => {
    if (!a.updated_at && !b.updated_at) return 0;
    if (!a.updated_at) return 1;
    if (!b.updated_at) return -1;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return sorted;
};

const mergeConversations = (
  conversations: ConversationMeta[],
  incoming: ConversationMeta[]
) => {
  const map = new Map<string, ConversationMeta>();

  for (const conv of conversations) {
    map.set(conv.id, conv);
  }

  for (const conv of incoming) {
    map.set(conv.id, conv);
  }

  return sortByUpdatedAt(Array.from(map.values()));
};

const mapDetailToMeta = (detail: ConversationDetail): ConversationMeta => ({
  id: detail.id,
  title: detail.title,
  role: detail.role,
  created_at: detail.created_at,
  updated_at: detail.updated_at,
  user_id: detail.user_id,
});

export const useConversationsStore = create<
  ConversationsState & ConversationsActions
>()(
  devtools(
    (set, get) => ({
      conversations: [],
      conversationsLoading: false,
      hasLoaded: false,
      loadingMore: false,
      hasMore: false,
      conversationsCursor: null,

      addConversation: (conversation) =>
        set((state) => ({
          ...state,
          conversations: mergeConversations(state.conversations, [conversation]),
        })),

      setConversations: (conversations) =>
        set((state) => ({
          ...state,
          conversations: mergeConversations(state.conversations, conversations),
        })),

      loadInitialConversations: async () => {
        const { hasLoaded, conversationsLoading } = get();
        if (hasLoaded || conversationsLoading) {
          return;
        }

        set((state) => ({ ...state, conversationsLoading: true }));

        try {
          const page = await listConversationsPageFn({
            data: { limit: PAGE_SIZE, cursor: null },
          });
          const mapped = (page.items as ConversationDetail[]).map(mapDetailToMeta);

          const latestRole = mapped[0]?.role;
          if (latestRole && !useMessageTreeStore.getState().conversationId) {
            useChatRequestStore.getState().setCurrentRole(latestRole);
          }

          set((state) => ({
            ...state,
            conversations: mergeConversations(state.conversations, mapped),
            hasLoaded: true,
            conversationsLoading: false,
            hasMore: page.nextCursor !== null,
            conversationsCursor: page.nextCursor,
          }));
        } catch (error) {
          console.error("Failed to load conversations:", error);
          set((state) => ({
            ...state,
            hasLoaded: true,
            conversationsLoading: false,
            hasMore: false,
            conversationsCursor: null,
          }));
        }
      },
      loadMoreConversations: async () => {
        const {
          hasLoaded,
          conversationsLoading,
          loadingMore,
          hasMore,
          conversationsCursor,
        } = get();
        if (
          !hasLoaded ||
          conversationsLoading ||
          loadingMore ||
          !hasMore
        ) {
          return;
        }

        set((state) => ({ ...state, loadingMore: true }));

        try {
          const page = await listConversationsPageFn({
            data: { limit: PAGE_SIZE, cursor: conversationsCursor },
          });
          const mapped = (page.items as ConversationDetail[]).map(mapDetailToMeta);

          set((state) => ({
            ...state,
            conversations: mergeConversations(state.conversations, mapped),
            loadingMore: false,
            hasMore: page.nextCursor !== null,
            conversationsCursor: page.nextCursor,
          }));
        } catch (error) {
          console.error("Failed to load more conversations:", error);
          set((state) => ({
            ...state,
            loadingMore: false,
            hasMore: false,
            conversationsCursor: null,
          }));
        }
      },

      clear: async () => {
        try {
          await clearConversationsFn();
        } catch (error) {
          console.error("Failed to clear conversations:", error);
        }

        set((state) => ({
          ...state,
          conversations: [],
          hasLoaded: true,
          loadingMore: false,
          hasMore: false,
          conversationsCursor: null,
        }));
      },
      reset: () => {
        set((state) => ({
          ...state,
          conversations: [],
          conversationsLoading: false,
          hasLoaded: false,
          loadingMore: false,
          hasMore: false,
          conversationsCursor: null,
        }));
      },

      deleteConversation: async (id) => {
        set((state) => ({
          ...state,
          conversations: state.conversations.filter(
            (item) => item.id !== id
          ),
        }));

        try {
          await deleteConversationFn({ data: { id } });
        } catch (error) {
          console.error("Failed to delete conversation:", error);
        }
      },

      updateConversationTitle: async (id, title) => {
        const { conversations } = get();
        const target = conversations.find((item) => item.id === id);

        if (!target) {
          return;
        }

        const updated: ConversationMeta = { ...target, title };

        set((state) => ({
          ...state,
          conversations: mergeConversations(state.conversations, [updated]),
        }));

        try {
          await updateConversationTitleFn({ data: { id, title } });
        } catch (error) {
          console.error("Failed to update conversation title:", error);
        }
      },
    }),
    { name: "ConversationsStore" }
  )
);
