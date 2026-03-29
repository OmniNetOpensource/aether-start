import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
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
} from '../conversation-tree/message-tree';
import {
  applyAssistantAddition,
  type AssistantAddition,
} from '../conversation-tree/block-operations';
import type { ConversationArtifact } from '@/features/conversations/session';
import type { ArtifactLanguage } from '@/features/chat/session';
import type {
  AssistantMessage,
  BranchInfo,
  ContentBlock,
  Message,
} from '@/features/chat/message-thread';
import { getZustandDevtoolsOptions } from '@/shared/browser/zustand-devtools';

type TreeSnapshot = ReturnType<typeof createEmptyMessageState>;
const STORE_FILE_NAME = 'useChatSessionStore.ts';

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

const getActionName = (actionName: string) => {
  if (!import.meta.env.DEV) {
    return actionName;
  }

  const stack = new Error().stack?.split('\n') ?? [];
  const line = stack.find((item) => item.includes('src/') && !item.includes(STORE_FILE_NAME));
  const callsite = line
    ?.match(/(?:\/|\\)(src[/\\][^)\s]+?(?:\?[^:\s)]+)?:\d+:\d+)/)?.[1]
    ?.replace(/\\/g, '/')
    ?.replace(/\?[^:\s)]+/, '');

  return callsite ? `${actionName} @ ${callsite}` : actionName;
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
  setAskUserQuestionsBlockStatus: (callId: string, status: 'pending' | 'submitting') => void;
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

export const useChatSessionStore = create<ChatSessionState & ChatSessionActions>()(
  devtools(
    (set, get) => ({
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

        set(
          {
            messages: linearState.messages,
            currentPath: linearState.currentPath,
            latestRootId: linearState.latestRootId,
            nextId: linearState.nextId,
          },
          false,
          getActionName('chatSession/setMessages'),
        );
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

        set(
          {
            messages: normalizedMessages,
            currentPath: nextPath,
            latestRootId,
            nextId,
          },
          false,
          getActionName('chatSession/initializeTree'),
        );
      },
      getMessagesFromPath: () => computeMessagesFromPath(get().messages, get().currentPath),
      setConversationId: (conversationId) =>
        set({ conversationId }, false, getActionName('chatSession/setConversationId')),
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

        set(
          {
            messages: nextState.messages,
            currentPath: nextState.currentPath,
            latestRootId: nextState.latestRootId,
            nextId: nextState.nextId,
          },
          false,
          getActionName('chatSession/selectMessage'),
        );
      },
      appendToAssistant: (addition) =>
        set(
          (state) => {
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
          },
          false,
          getActionName('chatSession/appendToAssistant'),
        ),
      setAskUserQuestionsBlockStatus: (callId, status) =>
        set(
          (state) => {
            const nextMessages = state.messages.map((message) => {
              if (message.role !== 'assistant') {
                return message;
              }

              const blocks = applyAssistantAddition(message.blocks, {
                kind: 'ask_user_questions_status',
                callId,
                status,
              });

              if (blocks === message.blocks) {
                return message;
              }

              return {
                ...message,
                blocks,
              };
            });

            return {
              messages: nextMessages,
            };
          },
          false,
          getActionName('chatSession/setAskUserQuestionsBlockStatus'),
        ),
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

        set(
          {
            messages: nextState.messages,
            currentPath: nextState.currentPath,
            latestRootId: nextState.latestRootId,
            nextId: nextState.nextId,
          },
          false,
          getActionName('chatSession/navigateBranch'),
        );
      },
      setArtifacts: (artifacts) =>
        set(
          {
            artifacts: artifacts.map((artifact) => ({
              ...artifact,
              status: 'completed',
              errorMessage: null,
            })),
            selectedArtifactId: artifacts[0]?.id ?? null,
            artifactPanelOpen: artifacts.length > 0,
            activeStreamingArtifactId: null,
            artifactView: artifacts.length > 0 ? 'preview' : 'code',
          },
          false,
          getActionName('chatSession/setArtifacts'),
        ),
      selectArtifact: (selectedArtifactId) =>
        set(
          (state) => {
            const target = state.artifacts.find((artifact) => artifact.id === selectedArtifactId);
            return {
              selectedArtifactId,
              artifactView: target?.status === 'completed' ? 'preview' : 'code',
            };
          },
          false,
          getActionName('chatSession/selectArtifact'),
        ),
      setArtifactPanelOpen: (artifactPanelOpen) =>
        set({ artifactPanelOpen }, false, getActionName('chatSession/setArtifactPanelOpen')),
      setArtifactView: (artifactView) =>
        set({ artifactView }, false, getActionName('chatSession/setArtifactView')),
      startArtifact: (artifactId) =>
        set(
          (state) => {
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
          },
          false,
          getActionName('chatSession/startArtifact'),
        ),
      updateArtifactTitle: (artifactId, title) =>
        set(
          (state) => ({
            artifacts: state.artifacts.map((artifact) =>
              artifact.id === artifactId
                ? { ...artifact, title, updated_at: new Date().toISOString() }
                : artifact,
            ),
          }),
          false,
          getActionName('chatSession/updateArtifactTitle'),
        ),
      updateArtifactLanguage: (artifactId, language) =>
        set(
          (state) => ({
            artifacts: state.artifacts.map((artifact) =>
              artifact.id === artifactId
                ? {
                    ...artifact,
                    language,
                    updated_at: new Date().toISOString(),
                  }
                : artifact,
            ),
          }),
          false,
          getActionName('chatSession/updateArtifactLanguage'),
        ),
      appendArtifactCode: (artifactId, delta) =>
        set(
          (state) => ({
            artifacts: state.artifacts.map((artifact) =>
              artifact.id === artifactId
                ? {
                    ...artifact,
                    code: artifact.code + delta,
                    updated_at: new Date().toISOString(),
                  }
                : artifact,
            ),
          }),
          false,
          getActionName('chatSession/appendArtifactCode'),
        ),
      completeArtifact: (artifactId) =>
        set(
          (state) => ({
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
              state.activeStreamingArtifactId === artifactId
                ? null
                : state.activeStreamingArtifactId,
            artifactView: 'preview',
          }),
          false,
          getActionName('chatSession/completeArtifact'),
        ),
      failArtifact: (artifactId, message) =>
        set(
          (state) => ({
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
              state.activeStreamingArtifactId === artifactId
                ? null
                : state.activeStreamingArtifactId,
            artifactView: 'code',
          }),
          false,
          getActionName('chatSession/failArtifact'),
        ),
      setCurrentModel: (modelId) =>
        set({ currentModelId: modelId }, false, getActionName('chatSession/setCurrentModel')),
      setCurrentPrompt: (promptId) =>
        set({ currentPromptId: promptId }, false, getActionName('chatSession/setCurrentPrompt')),
      setPageTitle: (title) =>
        set({ pageTitle: title }, false, getActionName('chatSession/setPageTitle')),
      clearSession: () => {
        const state = get();
        set(
          {
            ...createEmptyMessageState(),
            conversationId: null,
            pageTitle: 'Aether',
            ...initialArtifactState,
            currentModelId: state.currentModelId,
            currentPromptId: state.currentPromptId,
          },
          false,
          getActionName('chatSession/clearSession'),
        );
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
        set(
          (state) => ({
            messages: partial.messages
              ? normalizeMessageParentIds(partial.messages)
              : state.messages,
            currentPath: partial.currentPath ?? state.currentPath,
            latestRootId: partial.latestRootId ?? state.latestRootId,
            nextId: partial.nextId ?? state.nextId,
          }),
          false,
          getActionName('chatSession/setTreeState'),
        ),
      addMessage: (role, blocks, createdAt) => {
        const result = addMessage(get().getTreeState(), role, blocks, createdAt);
        set(
          {
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          },
          false,
          getActionName('chatSession/addMessage'),
        );
        return result;
      },
      editMessage: (depth, messageId, blocks) => {
        const result = editMessage(get().getTreeState(), depth, messageId, blocks);
        if (!result) {
          return null;
        }

        set(
          {
            messages: result.messages,
            currentPath: result.currentPath,
            latestRootId: result.latestRootId,
            nextId: result.nextId,
          },
          false,
          getActionName('chatSession/editMessage'),
        );

        return result;
      },
    }),
    getZustandDevtoolsOptions('ChatSessionStore'),
  ),
);

export const useIsNewChat = () =>
  useChatSessionStore((state) => state.conversationId === null && state.messages.length === 0);
