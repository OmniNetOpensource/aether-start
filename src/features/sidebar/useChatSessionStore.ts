import { create } from 'zustand';
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
import type { ConversationArtifact } from '@/features/sidebar/types/conversation';
import type { ArtifactLanguage } from '@/features/chat/types/chat-api';
import type {
  AssistantMessage,
  BranchInfo,
  ContentBlock,
  Message,
} from '@/features/chat/types/message';

type TreeSnapshot = ReturnType<typeof createEmptyMessageState>;

export type ModelInfo = { id: string; name: string };

export type PromptInfo = { id: string; name: string };

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

export type ChatSessionSelectionState = {
  currentModelId: string;
  currentPromptId: string;
};

export const initialChatSessionSelectionState: ChatSessionSelectionState = {
  currentModelId: '',
  currentPromptId: '',
};

type ChatSessionState = TreeSnapshot &
  ChatSessionSelectionState & {
    conversationId: string | null;
    pageTitle: string;
  } & ArtifactState;

type ChatSessionActions = {
  setMessages: (messages: Message[]) => void;
  initializeTree: (messages?: Message[], currentPath?: number[]) => void;
  getMessagesFromPath: () => Message[];
  setConversationId: (id: string | null) => void;
  selectMessage: (messageId: number) => void;
  appendToAssistant: (addition: AssistantAddition) => void;
  getBranchInfo: (messageId: number) => BranchInfo | null;
  navigateBranch: (messageId: number, depth: number, direction: 'prev' | 'next') => void;
  setCurrentModel: (modelId: string) => void;
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
  setPageTitle: (title: string) => void;
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

export const useChatSessionStore = create<ChatSessionState & ChatSessionActions>()((set, get) => ({
  ...createEmptyMessageState(),
  conversationId: null,
  pageTitle: 'Aether',
  ...initialChatSessionSelectionState,
  ...initialArtifactState,
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
  setCurrentModel: (modelId) => {
    set({ currentModelId: modelId });
  },
  setCurrentPrompt: (promptId) => {
    set({ currentPromptId: promptId });
  },
  setPageTitle: (title) => set({ pageTitle: title }),
  clearSession: () => {
    const state = get();
    set({
      ...createEmptyMessageState(),
      conversationId: null,
      pageTitle: 'Aether',
      ...initialArtifactState,
      currentModelId: state.currentModelId,
      currentPromptId: state.currentPromptId,
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
