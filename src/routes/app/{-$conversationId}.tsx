import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArtifactPanel, ArtifactToggleButton } from '@/features/chat/artifact';
import {
  cancelStreamSubscription,
  resetLastEventId,
  resumeRunningConversation,
} from '@/features/chat/agent-runtime/chat-orchestrator';
import { Composer, useComposerProps } from '@/features/chat/composer/Composer';
import { useChatRequestStore } from '@/features/chat/composer/composer-request/useChatRequestStore';
import { MessageList } from '@/features/chat/message-thread/MessageList';
import { NewChatGreeting } from '@/features/chat/message-thread/NewChatGreeting';
import { useEditingStore } from '@/features/chat/message-thread/useEditingStore';
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
  useChatSessionStore,
  useIsNewChat,
} from '@/features/conversations/session';
import { ShareButton } from '@/features/share/share-dialog';

const initializeSession = (conversation: ConversationDetail) => {
  let currentPath = conversation.currentPath;
  if (currentPath.length === 0 && conversation.messages.length > 0) {
    currentPath = buildCurrentPath(conversation.messages, conversation.messages[0].id);
  }

  const store = useChatSessionStore.getState();
  store.initializeTree(conversation.messages, currentPath);
  store.setArtifacts(conversation.artifacts);
  store.setPageTitle(conversation.title ?? 'Aether');
  store.setCurrentModel(conversation.model ?? '');
  store.setConversationId(conversation.id);
};

export const Route = createFileRoute('/app/{-$conversationId}')({
  beforeLoad: ({ params }) => {
    if (typeof window === 'undefined') return;

    if (params.conversationId) {
      const cachedConversation = getConversationFromCache(params.conversationId);
      if (useChatSessionStore.getState().conversationId !== params.conversationId) {
        cancelStreamSubscription('conversation/cache');
        useEditingStore.getState().clear();
        if (cachedConversation) {
          initializeSession(cachedConversation);
        } else {
          useChatSessionStore.getState().clearSession();
        }
      }
      return;
    }

    cancelStreamSubscription('new_chat/enter');
    useEditingStore.getState().clear();
    useChatSessionStore.getState().clearSession();
  },
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
    const [availableModels, availablePrompts, conversation] = await Promise.all([
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
    };
  },
  component: AppPage,
});

function AppPage() {
  const composerProps = useComposerProps();
  const { conversationId } = Route.useParams();
  const { conversation } = Route.useLoaderData();
  const cachedConversation = conversationId ? getConversationFromCache(conversationId) : undefined;
  const pageTitle = useChatSessionStore((state) => state.pageTitle);
  const sessionConversationId = useChatSessionStore((state) => state.conversationId);
  const sessionMessages = useChatSessionStore((state) => state.messages);
  const sessionCurrentPath = useChatSessionStore((state) => state.currentPath);
  const sessionArtifacts = useChatSessionStore((state) => state.artifacts);
  const sessionCurrentModelId = useChatSessionStore((state) => state.currentModelId);
  const isStreaming = useChatRequestStore((state) => state.status === 'streaming');
  const isNewChat = useIsNewChat();
  const visibleConversationId =
    typeof window === 'undefined'
      ? (conversationId ?? null)
      : window.location.pathname.startsWith('/app/')
        ? decodeURIComponent(window.location.pathname.slice('/app/'.length)) || null
        : null;
  const sessionReady = sessionConversationId === visibleConversationId;
  const routeDataReady = (conversationId ?? null) === visibleConversationId;
  const initialMessages = (conversation?.messages ?? []).filter(isMessage);
  let initialCurrentPath = conversation?.currentPath ?? [];
  if (initialCurrentPath.length === 0 && initialMessages.length > 0) {
    initialCurrentPath = buildCurrentPath(initialMessages, initialMessages[0].id);
  }

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    if (!conversationId) return;

    if (conversation) {
      const messages = conversation.messages.filter(isMessage);
      if (messages.length !== conversation.messages.length) {
        throw new Error('Invalid persisted message tree');
      }

      const detail: ConversationDetail = { ...conversation, messages };
      cacheConversation(detail);
      if (useChatSessionStore.getState().conversationId !== conversationId) {
        initializeSession(detail);
      }
    }

    if (useChatRequestStore.getState().status === 'idle') {
      void resumeRunningConversation(conversationId);
    }

    return () => {
      resetLastEventId();
      useEditingStore.getState().clear();
    };
  }, [conversation, conversationId]);

  useEffect(() => {
    if (!conversationId || !cachedConversation || !sessionReady) return;

    cacheConversation({
      ...cachedConversation,
      title: pageTitle,
      model: sessionCurrentModelId,
      currentPath: sessionCurrentPath,
      messages: sessionMessages,
      artifacts: sessionArtifacts,
    });
  }, [
    cachedConversation,
    conversationId,
    pageTitle,
    sessionArtifacts,
    sessionConversationId,
    sessionCurrentModelId,
    sessionCurrentPath,
    sessionMessages,
    sessionReady,
  ]);

  return (
    <div className='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar />
      <div className='relative flex-1 z-0 min-w-0 flex flex-col gap-2 min-h-0'>
        <div className='flex shrink-0 h-16 items-center gap-3 px-4 bg-transparent'>
          <div className='flex-1' />
          <ArtifactToggleButton />
          <ShareButton />
          <NewChatButton variant='topbar' className='rounded-lg' />
        </div>
        <main className='relative flex flex-row flex-1 min-h-0 min-w-0'>
          <div className='@container relative h-full flex-1 min-w-0'>
            <MessageList
              key={visibleConversationId ?? 'new'}
              messages={sessionReady ? sessionMessages : routeDataReady ? initialMessages : []}
              currentPath={
                sessionReady ? sessionCurrentPath : routeDataReady ? initialCurrentPath : []
              }
              isStreaming={isStreaming}
            />
            {isNewChat ? <NewChatGreeting /> : null}
            <Composer {...composerProps} />
          </div>
          <ArtifactPanel />
        </main>
      </div>
    </div>
  );
}
