import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ArtifactPanel, ArtifactToggleButton } from '@/features/chat/artifact';
import {
  cancelAnswering,
  cancelStreamSubscription,
  resetLastEventId,
  resumeRunningConversation,
} from '@/features/chat/agent-runtime/chat-orchestrator';
import type {
  ChatRuntimeState,
  ChatStatus,
} from '@/features/chat/agent-runtime/chat-runtime-state';
import { Composer, useComposerProps } from '@/features/chat/composer/Composer';
import { MessageList } from '@/features/chat/message-thread/MessageList';
import { NewChatGreeting } from '@/features/chat/message-thread/NewChatGreeting';
import type { EditingState } from '@/features/chat/message-thread/editing-state';
import {
  composerDocumentFromBlocks,
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
} from '@/features/chat/composer/composer-editor/composer-document';
import { isMessage } from '@/features/chat/message-thread/message';
import {
  DEFAULT_MODEL_ID,
  getAvailableModelsFn,
  getAvailablePromptsFn,
} from '@/features/chat/model-catalog';
import Sidebar from '@/features/conversations/conversation-list';
import { NewChatButton } from '@/features/conversations/conversation-list/NewChatButton';
import { buildCurrentPath } from '@/features/conversations/conversation-tree';
import {
  conversationInfiniteQueryOptions,
  cacheConversation,
  type ConversationDetail,
  getConversationFromCache,
  getConversationFn,
  queryClient,
  createChatSessionActions,
  createInitialChatSessionState,
  getChatSessionSelectionFn,
  persistChatSessionSelection,
  type ChatSessionActions,
  type ChatSessionSelectionState,
  type ChatSessionState,
} from '@/features/conversations/session';
import { ShareButton } from '@/features/share/share-dialog';
import { startChatRequest } from '@/features/chat/agent-runtime/chat-orchestrator';
import { useToast } from '@/shared/app-shell/useToast';

const initializeSession = (actions: ChatSessionActions, conversation: ConversationDetail) => {
  let currentPath = conversation.currentPath;
  if (currentPath.length === 0 && conversation.messages.length > 0) {
    currentPath = buildCurrentPath(conversation.messages, conversation.messages[0].id);
  }

  actions.initializeTree(conversation.messages, currentPath);
  actions.setArtifacts(conversation.artifacts);
  actions.setPageTitle(conversation.title ?? 'Aether');
  actions.setCurrentModel(conversation.model ?? '');
  actions.setConversationId(conversation.id);
};

export const Route = createFileRoute('/app/{-$conversationId}')({
  loader: async ({ params }) => {
    const conversationCached =
      typeof window !== 'undefined' && params.conversationId
        ? Boolean(getConversationFromCache(params.conversationId))
        : false;
    const conversationPromise =
      params.conversationId && !conversationCached
        ? getConversationFn({ data: { id: params.conversationId } })
        : Promise.resolve(null);
    const conversationListPromise = queryClient.getQueryData(
      conversationInfiniteQueryOptions.queryKey,
    )
      ? Promise.resolve()
      : queryClient.prefetchInfiniteQuery(conversationInfiniteQueryOptions);
    const [availableModels, availablePrompts, conversation, initialSelection] = await Promise.all([
      queryClient.ensureQueryData({
        queryKey: ['chat-options', 'models'],
        queryFn: () => getAvailableModelsFn(),
        staleTime: Infinity,
        gcTime: Infinity,
      }),
      queryClient.ensureQueryData({
        queryKey: ['chat-options', 'prompts'],
        queryFn: () => getAvailablePromptsFn(),
        staleTime: Infinity,
        gcTime: Infinity,
      }),
      conversationPromise,
      getChatSessionSelectionFn(),
      conversationListPromise,
    ]);

    if (params.conversationId && !conversation && !conversationCached) {
      throw redirect({ href: '/404' });
    }

    return {
      availableModels,
      availablePrompts,
      conversation,
      conversationCached,
      initialModelId: DEFAULT_MODEL_ID,
      initialPromptId: availablePrompts[0]?.id ?? 'aether',
      initialSelection,
    };
  },
  component: AppPage,
});

function AppPage() {
  const { conversationId } = Route.useParams();
  const {
    conversation,
    initialModelId,
    initialPromptId,
    initialSelection,
    availableModels,
    availablePrompts,
  } = Route.useLoaderData();
  const messages = conversation?.messages.filter(isMessage) ?? [];
  if (conversation && messages.length !== conversation.messages.length) {
    throw new Error('Invalid persisted message tree');
  }
  const detail: ConversationDetail | null = conversation ? { ...conversation, messages } : null;

  return (
    <ChatPage
      key={conversationId ?? 'new'}
      conversationId={conversationId}
      conversation={detail}
      initialModelId={initialModelId}
      initialPromptId={initialPromptId}
      initialSelection={initialSelection}
      availableModelIds={availableModels.map((model) => model.id)}
      availablePromptIds={availablePrompts.map((prompt) => prompt.id)}
    />
  );
}

function ChatPage({
  conversationId,
  conversation,
  initialModelId,
  initialPromptId,
  initialSelection,
  availableModelIds,
  availablePromptIds,
}: {
  conversationId?: string;
  conversation: ConversationDetail | null;
  initialModelId: string;
  initialPromptId: string;
  initialSelection: ChatSessionSelectionState;
  availableModelIds: string[];
  availablePromptIds: string[];
}) {
  const toast = useToast();
  const cachedConversation = conversationId ? getConversationFromCache(conversationId) : undefined;
  const [session, setSessionState] = useState(() => {
    let initialState = createInitialChatSessionState(
      initialModelId,
      initialPromptId,
      initialSelection,
    );
    const setInitialState: Dispatch<SetStateAction<ChatSessionState>> = (update) => {
      initialState = typeof update === 'function' ? update(initialState) : update;
    };
    const initialActions = createChatSessionActions(() => initialState, setInitialState);
    const initialConversation = conversation ?? cachedConversation;
    if (initialConversation) {
      initializeSession(initialActions, initialConversation);
    }
    if (!availableModelIds.includes(initialState.currentModelId)) {
      initialActions.setCurrentModel(initialModelId);
    }
    if (!availablePromptIds.includes(initialState.currentPromptId)) {
      initialActions.setCurrentPrompt(initialPromptId);
    }
    return initialState;
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const setSession: Dispatch<SetStateAction<ChatSessionState>> = (update) => {
    const next = typeof update === 'function' ? update(sessionRef.current) : update;
    sessionRef.current = next;
    setSessionState(next);
  };
  const [sessionActions] = useState(() =>
    createChatSessionActions(() => sessionRef.current, setSession),
  );
  const [status, setStatusState] = useState<ChatStatus>('idle');
  const statusRef = useRef(status);
  statusRef.current = status;
  const setStatus = (nextStatus: ChatStatus) => {
    statusRef.current = nextStatus;
    setStatusState(nextStatus);
  };
  const [runtime] = useState<ChatRuntimeState>(() => ({
    getSession: () => sessionRef.current,
    session: sessionActions,
    getStatus: () => statusRef.current,
    setStatus,
    toast,
  }));
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const composerProps = useComposerProps(runtime, status);
  const isStreaming = status === 'streaming';
  const isNewChat = session.conversationId === null && session.messages.length === 0;
  const visibleConversationId =
    typeof window === 'undefined'
      ? (conversationId ?? null)
      : window.location.pathname.startsWith('/app/')
        ? decodeURIComponent(window.location.pathname.slice('/app/'.length)) || null
        : null;
  const sessionReady = session.conversationId === visibleConversationId;
  const routeDataReady = (conversationId ?? null) === visibleConversationId;
  const initialMessages = (conversation?.messages ?? []).filter(isMessage);
  let initialCurrentPath = conversation?.currentPath ?? [];
  if (initialCurrentPath.length === 0 && initialMessages.length > 0) {
    initialCurrentPath = buildCurrentPath(initialMessages, initialMessages[0].id);
  }

  useEffect(() => {
    document.title = session.pageTitle;
  }, [session.pageTitle]);

  useEffect(() => {
    if (!conversationId) return;

    if (conversation) {
      const messages = conversation.messages.filter(isMessage);
      if (messages.length !== conversation.messages.length) {
        throw new Error('Invalid persisted message tree');
      }

      const detail: ConversationDetail = { ...conversation, messages };
      cacheConversation(detail);
    }

    if (runtime.getStatus() === 'idle') {
      void resumeRunningConversation(runtime, conversationId);
    }

    return () => {
      cancelStreamSubscription(runtime, 'conversation/unmount');
      resetLastEventId();
    };
  }, [conversation, conversationId, runtime]);

  useEffect(() => {
    persistChatSessionSelection(
      session.currentModelId,
      session.currentPromptId,
      session.currentFetchProvider,
    );
  }, [session.currentFetchProvider, session.currentModelId, session.currentPromptId]);

  useEffect(() => {
    if (!conversationId || !cachedConversation || !sessionReady) return;

    cacheConversation({
      ...cachedConversation,
      title: session.pageTitle,
      model: session.currentModelId,
      currentPath: session.currentPath,
      messages: session.messages,
      artifacts: session.artifacts,
    });
  }, [
    cachedConversation,
    conversationId,
    session.artifacts,
    session.conversationId,
    session.currentModelId,
    session.currentPath,
    session.messages,
    session.pageTitle,
    sessionReady,
  ]);

  const startEditing = (messageId: number) => {
    const target = sessionRef.current.messages[messageId - 1];
    if (!target || target.role !== 'user') return;
    setEditingState({
      messageId,
      editedDocument: composerDocumentFromBlocks(target.blocks),
    });
  };

  const submitEdit = async (_depth: number) => {
    if (!editingState) return;
    if (!runtime.getSession().currentModelId) {
      toast.warning('请先选择模型');
      return;
    }
    if (runtime.getStatus() !== 'idle') {
      await cancelAnswering(runtime, 'message/submitEdit');
    }
    if (isComposerDocumentEmpty(editingState.editedDocument)) {
      toast.warning('请输入内容或添加附件');
      return;
    }

    const target = runtime.getSession().messages[editingState.messageId - 1];
    if (!target || target.role !== 'user') {
      setEditingState(null);
      return;
    }

    await startChatRequest(
      runtime,
      {
        type: 'append',
        message: {
          role: 'user',
          blocks: composerDocumentToBlocks(editingState.editedDocument),
        },
        parentId: target.parentId,
        previousSiblingId: target.id,
      },
      () => setEditingState(null),
    );
  };

  const retryFromMessage = async (messageId: number, _depth: number) => {
    if (!runtime.getSession().currentModelId) {
      toast.warning('请先选择模型');
      return;
    }
    if (runtime.getStatus() !== 'idle') {
      await cancelAnswering(runtime, 'message/retry');
    }

    const target = runtime.getSession().messages[messageId - 1];
    if (!target) return;
    if (target.role === 'user') {
      await startChatRequest(
        runtime,
        {
          type: 'append',
          message: { role: 'user', blocks: target.blocks },
          parentId: target.parentId,
          previousSiblingId: target.id,
        },
        () => setEditingState(null),
      );
      return;
    }
    if (target.parentId === null) return;
    await startChatRequest(runtime, { type: 'regenerate', currentMessageId: target.parentId }, () =>
      setEditingState(null),
    );
  };

  return (
    <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar
        activeConversationId={session.conversationId}
        onSignOut={() => {
          setStatus('idle');
          setEditingState(null);
          sessionActions.clearSession();
        }}
      />
      <div className='relative flex-1 z-0 min-w-0 flex flex-col gap-2 min-h-0'>
        <div className='flex shrink-0 h-16 items-center gap-3 px-4 bg-transparent'>
          <div className='flex-1' />
          <ArtifactToggleButton
            session={session}
            onOpenChange={sessionActions.setArtifactPanelOpen}
          />
          <ShareButton session={session} status={status} />
          <NewChatButton variant='topbar' className='rounded-lg' />
        </div>
        <main className='relative flex flex-row flex-1 min-h-0 min-w-0'>
          <div className='@container relative h-full flex-1 min-w-0'>
            <MessageList
              key={visibleConversationId ?? 'new'}
              messages={sessionReady ? session.messages : routeDataReady ? initialMessages : []}
              currentPath={
                sessionReady ? session.currentPath : routeDataReady ? initialCurrentPath : []
              }
              isStreaming={isStreaming}
              status={status}
              editingState={editingState}
              runtime={runtime}
              onStartEditing={startEditing}
              onEditDocumentChange={(document) =>
                setEditingState((current) =>
                  current ? { ...current, editedDocument: document } : current,
                )
              }
              onCancelEditing={() => setEditingState(null)}
              onSubmitEdit={submitEdit}
              onRetry={retryFromMessage}
              onNavigateBranch={sessionActions.navigateBranch}
            />
            {isNewChat ? <NewChatGreeting /> : null}
            <Composer {...composerProps} />
          </div>
          <ArtifactPanel session={session} actions={sessionActions} />
        </main>
      </div>
    </div>
  );
}
