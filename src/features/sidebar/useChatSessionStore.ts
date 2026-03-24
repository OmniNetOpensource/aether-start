import { create } from 'zustand';
import {
  listConversationsPageFn,
  type ConversationListCursor,
  clearConversationsFn,
  deleteConversationFn,
  setConversationPinnedFn,
  updateConversationTitleFn,
} from '@/server/functions/conversations';
import {
  addMessage,
  buildCurrentPath,
  computeMessagesFromPath,
  createEmptyMessageState,
  createLinearMessages,
  editMessage,
  getBranchInfo,
  normalizeMessageParentIds,
  switchBranch,
} from './tree/message-tree';
import { applyAssistantAddition, type AssistantAddition } from './tree/block-operations';
import type {
  ConversationArtifact,
  ConversationDetail,
  ConversationMeta,
} from '@/types/conversation';
import type { ArtifactLanguage } from '@/types/chat-api';
import type { AssistantMessage, BranchInfo, ContentBlock, Message } from '@/types/message';

type TreeSnapshot = ReturnType<typeof createEmptyMessageState>;

export type RoleInfo = { id: string; name: string };

export type PromptInfo = { id: string; name: string };

type ConversationListState = {
  conversations: ConversationMeta[];
  conversationsLoading: boolean;
  hasLoaded: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  conversationsCursor: ConversationListCursor;
};

export type ArtifactStatus = 'streaming' | 'completed' | 'failed';
export type ArtifactView = 'code' | 'preview';

export type ArtifactRecord = ConversationArtifact & {
  status: ArtifactStatus;
  errorMessage: string | null;
};

type ArtifactState = {
  artifacts: ArtifactRecord[];
  selectedArtifactId: string | null;
  artifactPanelOpen: boolean;
  activeStreamingArtifactId: string | null;
  artifactView: ArtifactView;
};

const initialArtifactState: ArtifactState = {
  artifacts: [],
  selectedArtifactId: null,
  artifactPanelOpen: false,
  activeStreamingArtifactId: null,
  artifactView: 'code',
};

export const initialConversationListState: ConversationListState = {
  conversations: [],
  conversationsLoading: false,
  hasLoaded: false,
  loadingMore: false,
  hasMore: false,
  conversationsCursor: null,
};

const MODEL_STORAGE_KEY = 'aether_current_role';
const PROMPT_STORAGE_KEY = 'aether_current_prompt';
const PAGE_SIZE = 10;

const setStoredValue = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export type ChatSessionSelectionState = {
  currentRole: string;
  currentPrompt: string;
};

export const initialChatSessionSelectionState: ChatSessionSelectionState = {
  currentRole: '',
  currentPrompt: '',
};

type ChatSessionState = TreeSnapshot &
  ConversationListState &
  ChatSessionSelectionState & {
    conversationId: string | null;
  } & ArtifactState;

type ChatSessionActions = {
  addConversation: (conversation: ConversationMeta) => void;
  loadMoreConversations: () => Promise<void>;
  clearConversations: () => Promise<void>;
  resetConversations: () => void;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  setConversationPinned: (id: string, pinned: boolean) => Promise<void>;
  setMessages: (messages: Message[]) => void;
  initializeTree: (messages?: Message[], currentPath?: number[]) => void;
  getMessagesFromPath: () => Message[];
  setConversationId: (id: string | null) => void;
  selectMessage: (messageId: number) => void;
  appendToAssistant: (addition: AssistantAddition) => void;
  getBranchInfo: (messageId: number) => BranchInfo | null;
  navigateBranch: (messageId: number, depth: number, direction: 'prev' | 'next') => void;
  setCurrentRole: (role: string) => void;
  setCurrentPrompt: (promptId: string) => void;
  setArtifacts: (artifacts: ConversationArtifact[]) => void;
  selectArtifact: (artifactId: string | null) => void;
  setArtifactPanelOpen: (open: boolean) => void;
  setArtifactView: (view: ArtifactView) => void;
  startArtifact: (artifactId: string) => void;
  updateArtifactTitle: (artifactId: string, title: string) => void;
  updateArtifactLanguage: (artifactId: string, language: ArtifactLanguage) => void;
  appendArtifactCode: (artifactId: string, delta: string) => void;
  completeArtifact: (artifactId: string) => void;
  failArtifact: (artifactId: string, message: string) => void;
  clearSession: () => void;
  getTreeState: () => TreeSnapshot;
  setTreeState: (partial: Partial<TreeSnapshot>) => void;
  addMessage: (
    role: Message['role'],
    blocks: ContentBlock[],
    createdAt?: string,
  ) => ReturnType<typeof addMessage>;
  editMessage: (
    depth: number,
    messageId: number,
    blocks: ContentBlock[],
  ) => ReturnType<typeof editMessage> | null;
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

const upsertConversations = (conversations: ConversationMeta[], incoming: ConversationMeta[]) => {
  const map = new Map<string, ConversationMeta>();

  for (const conversation of conversations) {
    map.set(conversation.id, conversation);
  }

  for (const conversation of incoming) {
    map.set(conversation.id, conversation);
  }

  return sortConversations(Array.from(map.values()));
};

const mapDetailToMeta = (detail: ConversationDetail): ConversationMeta => ({
  id: detail.id,
  title: detail.title,
  role: detail.role,
  is_pinned: detail.is_pinned,
  pinned_at: detail.pinned_at,
  created_at: detail.created_at,
  updated_at: detail.updated_at,
  user_id: detail.user_id,
});

export const useChatSessionStore = create<ChatSessionState & ChatSessionActions>()((set, get) => ({
  ...createEmptyMessageState(),
  ...initialConversationListState,
  conversationId: null,
  ...initialChatSessionSelectionState,
  ...initialArtifactState,
  addConversation: (conversation) =>
    set((state) => ({
      conversations: upsertConversations(state.conversations, [conversation]),
    })),

  loadMoreConversations: async () => {
    const { hasLoaded, conversationsLoading, loadingMore, hasMore, conversationsCursor } = get();
    if (!hasLoaded || conversationsLoading || loadingMore || !hasMore) {
      return;
    }

    set({ loadingMore: true });

    try {
      const page = await listConversationsPageFn({
        data: { limit: PAGE_SIZE, cursor: conversationsCursor },
      });
      const conversations = (page.items as ConversationDetail[]).map(mapDetailToMeta);

      set((state) => ({
        conversations: upsertConversations(state.conversations, conversations),
        loadingMore: false,
        hasMore: page.nextCursor !== null,
        conversationsCursor: page.nextCursor,
      }));
    } catch (error) {
      console.error('Failed to load more conversations:', error);
      set({
        loadingMore: false,
        hasMore: false,
        conversationsCursor: null,
      });
    }
  },
  clearConversations: async () => {
    try {
      await clearConversationsFn();
    } catch (error) {
      console.error('Failed to clear conversations:', error);
    }

    set({
      conversations: [],
      hasLoaded: true,
      conversationsLoading: false,
      loadingMore: false,
      hasMore: false,
      conversationsCursor: null,
    });
  },
  resetConversations: () =>
    set({
      ...initialConversationListState,
    }),
  deleteConversation: async (id) => {
    set((state) => ({
      conversations: state.conversations.filter((item) => item.id !== id),
    }));

    try {
      await deleteConversationFn({ data: { id } });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
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
      conversations: upsertConversations(state.conversations, [updated]),
    }));

    try {
      await updateConversationTitleFn({ data: { id, title } });
    } catch (error) {
      console.error('Failed to update conversation title:', error);
    }
  },
  setConversationPinned: async (id, pinned) => {
    const { conversations } = get();
    const target = conversations.find((item) => item.id === id);
    if (!target) {
      return;
    }

    const optimistic: ConversationMeta = {
      ...target,
      is_pinned: pinned,
      pinned_at: pinned ? new Date().toISOString() : null,
    };

    set((state) => ({
      conversations: upsertConversations(state.conversations, [optimistic]),
    }));

    try {
      const result = await setConversationPinnedFn({
        data: { id, pinned },
      });
      set((state) => ({
        conversations: upsertConversations(state.conversations, [
          {
            ...optimistic,
            pinned_at: pinned ? result.pinned_at : null,
          },
        ]),
      }));
    } catch (error) {
      console.error('Failed to update conversation pin state:', error);
      set((state) => ({
        conversations: upsertConversations(state.conversations, [target]),
      }));
    }
  },
  setMessages: (messages) => {
    const linearState = createLinearMessages(
      messages.map((message) => ({
        role: message.role,
        blocks: message.blocks ?? [],
        createdAt: message.createdAt,
      })),
    );

    set({
      messages: linearState.messages,
      currentPath: linearState.currentPath,
      latestRootId: linearState.latestRootId,
      nextId: linearState.nextId,
    });
  },
  initializeTree: (messages = [], currentPath = []) => {
    const normalizedMessages = normalizeMessageParentIds(messages);
    const resolvedCurrentPath =
      Array.isArray(currentPath) && currentPath.every((id) => typeof id === 'number')
        ? currentPath
        : [];
    const fallbackRootId = normalizedMessages.length > 0 ? normalizedMessages[0].id : null;
    const nextPath =
      resolvedCurrentPath.length > 0
        ? resolvedCurrentPath
        : buildCurrentPath(normalizedMessages, fallbackRootId);
    const latestRootId = nextPath[0] ?? fallbackRootId;
    const nextId =
      normalizedMessages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1;

    set({
      messages: normalizedMessages,
      currentPath: nextPath,
      latestRootId,
      nextId,
    });
  },
  getMessagesFromPath: () => computeMessagesFromPath(get().messages, get().currentPath),
  setConversationId: (conversationId) => set({ conversationId }),
  selectMessage: (messageId) => {
    const state = get();
    const targetPath: number[] = [];
    const visited = new Set<number>();
    let currentId: number | null = messageId;

    while (currentId !== null) {
      if (visited.has(currentId)) {
        return;
      }

      const currentMessage: Message | undefined = state.messages[currentId - 1];
      if (!currentMessage) {
        return;
      }

      targetPath.push(currentId);
      visited.add(currentId);
      currentId = currentMessage.parentId;
    }

    targetPath.reverse();

    let nextState = state.getTreeState();
    for (let index = 0; index < targetPath.length; index += 1) {
      nextState = switchBranch(nextState, index + 1, targetPath[index]);
    }

    set({
      messages: nextState.messages,
      currentPath: nextState.currentPath,
      latestRootId: nextState.latestRootId,
      nextId: nextState.nextId,
    });
  },
  appendToAssistant: (addition) =>
    set((state) => {
      const lastId = state.currentPath[state.currentPath.length - 1] ?? null;
      const lastMessage = lastId ? state.messages[lastId - 1] : null;

      let nextMessages = state.messages;
      let nextPath = state.currentPath;
      let nextLatestRootId = state.latestRootId;
      let nextId = state.nextId;
      let assistantId = lastId;

      if (!lastMessage || lastMessage.role !== 'assistant') {
        const result = addMessage(
          {
            messages: state.messages,
            currentPath: state.currentPath,
            latestRootId: state.latestRootId,
            nextId: state.nextId,
          },
          'assistant',
          [],
        );
        nextMessages = result.messages;
        nextPath = result.currentPath;
        nextLatestRootId = result.latestRootId;
        nextId = result.nextId;
        assistantId = result.addedMessage.id;
      }

      if (!assistantId || !nextMessages[assistantId - 1]) {
        return state;
      }

      const targetMessage = nextMessages[assistantId - 1] as AssistantMessage;
      const updatedMessages = [...nextMessages];
      updatedMessages[assistantId - 1] = {
        ...targetMessage,
        blocks: applyAssistantAddition(targetMessage.blocks ?? [], addition),
      };

      return {
        messages: updatedMessages,
        currentPath: nextPath,
        latestRootId: nextLatestRootId,
        nextId,
      };
    }),
  getBranchInfo: (messageId) => getBranchInfo(get().messages, messageId),
  navigateBranch: (messageId, depth, direction) => {
    const state = get();
    const info = getBranchInfo(state.messages, messageId);
    if (!info) {
      return;
    }

    const nextIndex = direction === 'prev' ? info.currentIndex - 1 : info.currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= info.total) {
      return;
    }

    const targetId = info.siblingIds[nextIndex];
    const nextState = switchBranch(state.getTreeState(), depth, targetId);

    set({
      messages: nextState.messages,
      currentPath: nextState.currentPath,
      latestRootId: nextState.latestRootId,
      nextId: nextState.nextId,
    });
  },
  setArtifacts: (artifacts) =>
    set({
      artifacts: artifacts.map((artifact) => ({
        ...artifact,
        status: 'completed',
        errorMessage: null,
      })),
      selectedArtifactId: artifacts[0]?.id ?? null,
      artifactPanelOpen: artifacts.length > 0,
      activeStreamingArtifactId: null,
      artifactView: artifacts.length > 0 ? 'preview' : 'code',
    }),
  selectArtifact: (selectedArtifactId) =>
    set((state) => {
      const target = state.artifacts.find((artifact) => artifact.id === selectedArtifactId);
      return {
        selectedArtifactId,
        artifactView: target?.status === 'completed' ? 'preview' : 'code',
      };
    }),
  setArtifactPanelOpen: (artifactPanelOpen) => set({ artifactPanelOpen }),
  setArtifactView: (artifactView) => set({ artifactView }),
  startArtifact: (artifactId) =>
    set((state) => {
      const now = new Date().toISOString();
      const existing = state.artifacts.find((artifact) => artifact.id === artifactId);
      const nextArtifact: ArtifactRecord = existing ?? {
        id: artifactId,
        conversation_id: state.conversationId ?? '',
        title: 'Untitled Artifact',
        language: 'html',
        code: '',
        created_at: now,
        updated_at: now,
        status: 'streaming',
        errorMessage: null,
      };

      const nextArtifacts: ArtifactRecord[] = [
        {
          ...nextArtifact,
          status: 'streaming',
          errorMessage: null,
          updated_at: now,
        },
        ...state.artifacts.filter((artifact) => artifact.id !== artifactId),
      ];

      return {
        artifacts: nextArtifacts,
        selectedArtifactId: artifactId,
        artifactPanelOpen: true,
        activeStreamingArtifactId: artifactId,
        artifactView: 'code',
      };
    }),
  updateArtifactTitle: (artifactId, title) =>
    set((state) => ({
      artifacts: state.artifacts.map((artifact) =>
        artifact.id === artifactId
          ? { ...artifact, title, updated_at: new Date().toISOString() }
          : artifact,
      ),
    })),
  updateArtifactLanguage: (artifactId, language) =>
    set((state) => ({
      artifacts: state.artifacts.map((artifact) =>
        artifact.id === artifactId
          ? {
              ...artifact,
              language,
              updated_at: new Date().toISOString(),
            }
          : artifact,
      ),
    })),
  appendArtifactCode: (artifactId, delta) =>
    set((state) => ({
      artifacts: state.artifacts.map((artifact) =>
        artifact.id === artifactId
          ? {
              ...artifact,
              code: artifact.code + delta,
              updated_at: new Date().toISOString(),
            }
          : artifact,
      ),
    })),
  completeArtifact: (artifactId) =>
    set((state) => ({
      artifacts: state.artifacts.map((artifact) =>
        artifact.id === artifactId
          ? {
              ...artifact,
              status: 'completed',
              errorMessage: null,
              updated_at: new Date().toISOString(),
            }
          : artifact,
      ),
      selectedArtifactId: artifactId,
      artifactPanelOpen: true,
      activeStreamingArtifactId:
        state.activeStreamingArtifactId === artifactId ? null : state.activeStreamingArtifactId,
      artifactView: 'preview',
    })),
  failArtifact: (artifactId, message) =>
    set((state) => ({
      artifacts: state.artifacts.map((artifact) =>
        artifact.id === artifactId
          ? {
              ...artifact,
              status: 'failed',
              errorMessage: message,
              updated_at: new Date().toISOString(),
            }
          : artifact,
      ),
      selectedArtifactId: artifactId,
      artifactPanelOpen: true,
      activeStreamingArtifactId:
        state.activeStreamingArtifactId === artifactId ? null : state.activeStreamingArtifactId,
      artifactView: 'code',
    })),
  setCurrentRole: (currentRole) => {
    set({ currentRole });

    if (currentRole) {
      setStoredValue(MODEL_STORAGE_KEY, currentRole);
    }
  },
  setCurrentPrompt: (currentPrompt) => {
    set({ currentPrompt });

    if (currentPrompt) {
      setStoredValue(PROMPT_STORAGE_KEY, currentPrompt);
    }
  },
  clearSession: () => {
    const state = get();
    set({
      ...createEmptyMessageState(),
      conversationId: null,
      ...initialArtifactState,
      currentRole: state.currentRole,
      currentPrompt: state.currentPrompt,
    });
  },
  getTreeState: () => {
    const state = get();
    return {
      messages: state.messages,
      currentPath: state.currentPath,
      latestRootId: state.latestRootId,
      nextId: state.nextId,
    };
  },
  setTreeState: (partial) =>
    set((state) => ({
      messages: partial.messages ? normalizeMessageParentIds(partial.messages) : state.messages,
      currentPath: partial.currentPath ?? state.currentPath,
      latestRootId: partial.latestRootId ?? state.latestRootId,
      nextId: partial.nextId ?? state.nextId,
    })),
  addMessage: (role, blocks, createdAt) => {
    const result = addMessage(get().getTreeState(), role, blocks, createdAt);
    set({
      messages: result.messages,
      currentPath: result.currentPath,
      latestRootId: result.latestRootId,
      nextId: result.nextId,
    });
    return result;
  },
  editMessage: (depth, messageId, blocks) => {
    const result = editMessage(get().getTreeState(), depth, messageId, blocks);
    if (!result) {
      return null;
    }

    set({
      messages: result.messages,
      currentPath: result.currentPath,
      latestRootId: result.latestRootId,
      nextId: result.nextId,
    });

    return result;
  },
}));

export const useIsNewChat = () =>
  useChatSessionStore((state) => state.conversationId === null && state.messages.length === 0);
