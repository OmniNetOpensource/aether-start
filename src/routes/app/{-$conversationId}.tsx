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
import type { Message } from '@/features/chat/message-thread/message';
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
  getConversationFn,
  queryClient,
  useChatSessionStore,
  useIsNewChat,
} from '@/features/conversations/session';
import { ShareButton } from '@/features/share/share-dialog';

export const Route = createFileRoute('/app/{-$conversationId}')({
  beforeLoad: ({ params }) => {
    if (params.conversationId || typeof window === 'undefined') return;

    cancelStreamSubscription('new_chat/enter');
    useEditingStore.getState().clear();
    useChatSessionStore.getState().clearSession();
  },
  loader: async ({ params }) => {
    const [availableModels, availablePrompts, conversation] = await Promise.all([
      getAvailableModelsFn(),
      getAvailablePromptsFn(),
      params.conversationId
        ? getConversationFn({ data: { id: params.conversationId } })
        : Promise.resolve(null),
      queryClient.prefetchInfiniteQuery(conversationInfiniteQueryOptions),
    ]);

    if (params.conversationId && !conversation) {
      throw redirect({ href: '/404' });
    }

    return {
      availableModels,
      availablePrompts,
      conversation,
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
  const pageTitle = useChatSessionStore((state) => state.pageTitle);
  const sessionConversationId = useChatSessionStore((state) => state.conversationId);
  const sessionMessages = useChatSessionStore((state) => state.messages);
  const sessionCurrentPath = useChatSessionStore((state) => state.currentPath);
  const isStreaming = useChatRequestStore((state) => state.status === 'streaming');
  const isNewChat = useIsNewChat();
  const sessionReady = sessionConversationId === (conversationId ?? null);
  const initialMessages = (conversation?.messages ?? []) as Message[];
  let initialCurrentPath = conversation?.currentPath ?? [];
  if (initialCurrentPath.length === 0 && initialMessages.length > 0) {
    initialCurrentPath = buildCurrentPath(initialMessages, initialMessages[0].id);
  }

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  useEffect(() => {
    if (!conversationId || !conversation) return;

    const messages = (conversation.messages ?? []) as Message[];
    const store = useChatSessionStore.getState();
    let currentPath = conversation.currentPath ?? [];
    if (currentPath.length === 0 && messages.length > 0) {
      currentPath = buildCurrentPath(messages, messages[0].id);
    }
    store.initializeTree(messages, currentPath);
    store.setArtifacts(conversation.artifacts ?? []);
    store.setPageTitle(conversation.title ?? 'Aether');
    store.setCurrentModel(conversation.model ?? '');
    store.setConversationId(conversationId);
    void resumeRunningConversation(conversationId);

    return () => {
      resetLastEventId();
      useEditingStore.getState().clear();
    };
  }, [conversation, conversationId]);

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
              key={conversationId ?? 'new'}
              messages={sessionReady ? sessionMessages : initialMessages}
              currentPath={sessionReady ? sessionCurrentPath : initialCurrentPath}
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
