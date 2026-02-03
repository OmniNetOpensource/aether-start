import { create } from "zustand";
import type { Conversation } from "@/types/conversation";
import { localDB, type LocalConversation } from "@/src/shared/lib/indexed-db";

type ConversationsState = {
  pinnedConversations: Conversation[];
  normalConversations: Conversation[];
  conversationsLoading: boolean;
  hasLoadedLocal: boolean;
};

type ConversationsActions = {
  addConversation: (conversation: Conversation) => void;
  setConversations: (conversations: Conversation[]) => void;
  loadLocalConversations: () => Promise<void>;
  clearLocal: () => Promise<void>;
  pinConversation: (id: string) => Promise<void>;
  unpinConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
};

const sortByPinnedAt = (conversations: Conversation[]): Conversation[] => {
  const sorted = [...conversations];
  sorted.sort((a, b) => {
    const aPinnedAt = a.pinned_at ?? a.updated_at ?? "";
    const bPinnedAt = b.pinned_at ?? b.updated_at ?? "";
    if (!aPinnedAt && !bPinnedAt) return 0;
    if (!aPinnedAt) return 1;
    if (!bPinnedAt) return -1;
    return bPinnedAt.localeCompare(aPinnedAt);
  });
  return sorted;
};

const sortByUpdatedAt = (conversations: Conversation[]): Conversation[] => {
  const sorted = [...conversations];
  sorted.sort((a, b) => {
    if (!a.updated_at && !b.updated_at) return 0;
    if (!a.updated_at) return 1;
    if (!b.updated_at) return -1;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return sorted;
};

const splitAndSortConversations = (conversations: Conversation[]) => {
  const pinned: Conversation[] = [];
  const normal: Conversation[] = [];

  for (const conversation of conversations) {
    if (conversation.pinned) {
      pinned.push(conversation);
    } else {
      normal.push(conversation);
    }
  }

  return {
    pinnedConversations: sortByPinnedAt(pinned),
    normalConversations: sortByUpdatedAt(normal),
  };
};

const mergeConversations = (
  pinnedConversations: Conversation[],
  normalConversations: Conversation[],
  incoming: Conversation[]
) => {
  const map = new Map<string, Conversation>();

  for (const conv of pinnedConversations) {
    map.set(conv.id, conv);
  }

  for (const conv of normalConversations) {
    map.set(conv.id, conv);
  }

  for (const conv of incoming) {
    map.set(conv.id, conv);
  }

  return splitAndSortConversations(Array.from(map.values()));
};

const mapLocalToConversation = (local: LocalConversation): Conversation => ({
  id: local.id,
  title: local.title,
  created_at: local.created_at,
  updated_at: local.updated_at,
  pinned: local.pinned,
  pinned_at: local.pinned_at,
  user_id: "",
});

export const useConversationsStore = create<
  ConversationsState & ConversationsActions
>((set, get) => ({
  pinnedConversations: [],
  normalConversations: [],
  conversationsLoading: false,
  hasLoadedLocal: false,

  addConversation: (conversation) =>
    set((state) => {
      const merged = mergeConversations(
        state.pinnedConversations,
        state.normalConversations,
        [conversation]
      );
      return { ...state, ...merged };
    }),

  setConversations: (conversations) =>
    set((state) => ({
      ...state,
      ...mergeConversations(
        state.pinnedConversations,
        state.normalConversations,
        conversations
      ),
    })),

  loadLocalConversations: async () => {
    const { hasLoadedLocal, conversationsLoading } = get();
    if (hasLoadedLocal || conversationsLoading) {
      return;
    }

    set((state) => ({ ...state, conversationsLoading: true }));

    try {
      const localConversations = await localDB.getAll();
      const mapped: Conversation[] = localConversations.map(
        mapLocalToConversation
      );

      set((state) => ({
        ...state,
        ...mergeConversations(
          state.pinnedConversations,
          state.normalConversations,
          mapped
        ),
        hasLoadedLocal: true,
        conversationsLoading: false,
      }));
    } catch (error) {
      console.error("Failed to load local conversations:", error);
      set((state) => ({
        ...state,
        hasLoadedLocal: true,
        conversationsLoading: false,
      }));
    }
  },

  clearLocal: async () => {
    try {
      await localDB.clear();
    } catch (error) {
      console.error("Failed to clear local conversations:", error);
    }

    set((state) => ({
      ...state,
      pinnedConversations: [],
      normalConversations: [],
      hasLoadedLocal: true,
    }));
  },

  pinConversation: async (id) => {
    const { normalConversations } = get();
    const target = normalConversations.find((item) => item.id === id);
    if (!target) {
      return;
    }

    const pinned_at = new Date().toISOString();
    const updated: Conversation = {
      ...target,
      pinned: true,
      pinned_at,
    };

    set((state) => ({
      ...state,
      normalConversations: state.normalConversations.filter(
        (item) => item.id !== id
      ),
      pinnedConversations: sortByPinnedAt([
        updated,
        ...state.pinnedConversations.filter((item) => item.id !== id),
      ]),
    }));

    try {
      const existing = await localDB.get(id);
      if (existing) {
        await localDB.save({
          ...existing,
          pinned: true,
          pinned_at,
        });
      }
    } catch (error) {
      console.error("Failed to pin conversation:", error);
    }
  },

  unpinConversation: async (id) => {
    const { pinnedConversations } = get();
    const target = pinnedConversations.find((item) => item.id === id);
    if (!target) {
      return;
    }

    const updated: Conversation = {
      ...target,
      pinned: false,
      pinned_at: undefined,
    };

    set((state) => ({
      ...state,
      pinnedConversations: state.pinnedConversations.filter(
        (item) => item.id !== id
      ),
      normalConversations: sortByUpdatedAt([
        updated,
        ...state.normalConversations.filter((item) => item.id !== id),
      ]),
    }));

    try {
      const existing = await localDB.get(id);
      if (existing) {
        await localDB.save({
          ...existing,
          pinned: false,
          pinned_at: undefined,
        });
      }
    } catch (error) {
      console.error("Failed to unpin conversation:", error);
    }
  },

  deleteConversation: async (id) => {
    set((state) => ({
      ...state,
      pinnedConversations: state.pinnedConversations.filter(
        (item) => item.id !== id
      ),
      normalConversations: state.normalConversations.filter(
        (item) => item.id !== id
      ),
    }));

    try {
      await localDB.delete(id);
    } catch (error) {
      console.error("Failed to delete local conversation:", error);
    }
  },
  updateConversationTitle: async (id, title) => {
    const { pinnedConversations, normalConversations } = get();
    const allConversations = [...pinnedConversations, ...normalConversations];
    const target = allConversations.find((item) => item.id === id);

    if (!target) {
      return;
    }

    const updated: Conversation = { ...target, title };

    set((state) => ({
      ...state,
      ...mergeConversations(
        state.pinnedConversations,
        state.normalConversations,
        [updated]
      ),
    }));

    try {
      const existing = await localDB.get(id);
      if (existing) {
        await localDB.save({ ...existing, title });
      }
    } catch (error) {
      console.error("Failed to update conversation title:", error);
    }
  },
}));
