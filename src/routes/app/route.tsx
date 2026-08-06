import { Outlet, createFileRoute } from '@tanstack/solid-router';
import { createEffect, onSettled } from 'solid-js';
import { ArtifactPanel, ArtifactToggleButton } from '@/frontend/chat/artifact';
import { cancelStreamSubscription } from '@/frontend/chat/agent-runtime/chat-orchestrator';
import { resetLastEventId } from '@/frontend/chat/agent-runtime/event-handlers';
import { chatState, registerChatToast } from '@/frontend/chat/agent-runtime/chat-state';
import { Composer } from '@/frontend/chat/composer/Composer';
import { DEFAULT_MODEL_ID } from '@/shared/chat/model-catalog';
import { getAvailableModelsFn, getAvailablePromptsFn } from '@/rpc/chat-options';
import Sidebar from '@/frontend/conversations/conversation-list';
import { NewChatButton } from '@/frontend/conversations/conversation-list/NewChatButton';
import {
  conversationInfiniteQueryOptions,
  queryClient,
  currentFetchProvider,
  currentModelId,
  currentPromptId,
  getChatSessionSelectionFn,
  pageTitle,
  persistChatSessionSelection,
  setCurrentFetchProvider,
  setCurrentModelId,
  setCurrentPromptId,
} from '@/frontend/conversations/session';
import { ShareButton } from '@/frontend/share/share-dialog';
import { useToast } from '@/frontend/app-shell/useToast';

export const Route = createFileRoute('/app')({
  loader: async () => {
    const conversationListPromise = queryClient.prefetchInfiniteQuery({
      ...conversationInfiniteQueryOptions,
      staleTime: Infinity,
    });
    const [availableModels, availablePrompts, initialSelection] = await Promise.all([
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
      getChatSessionSelectionFn(),
      conversationListPromise,
    ]);

    const modelId = availableModels.some((model) => model.id === initialSelection.currentModelId)
      ? initialSelection.currentModelId
      : DEFAULT_MODEL_ID;
    const promptId = availablePrompts.some(
      (prompt) => prompt.id === initialSelection.currentPromptId,
    )
      ? initialSelection.currentPromptId
      : (availablePrompts[0]?.id ?? 'aether');
    setCurrentModelId(modelId);
    setCurrentPromptId(promptId);
    setCurrentFetchProvider(initialSelection.currentFetchProvider);

    return {
      availableModels,
      availablePrompts,
      initialModelId: DEFAULT_MODEL_ID,
      initialPromptId: availablePrompts[0]?.id ?? 'aether',
      initialSelection,
    };
  },
  component: AppLayout,
});

function AppLayout() {
  registerChatToast(useToast());

  createEffect(pageTitle, (title) => {
    document.title = title;
  });

  createEffect(
    () => ({
      modelId: currentModelId(),
      promptId: currentPromptId(),
      fetchProvider: currentFetchProvider(),
    }),
    (selection) => {
      persistChatSessionSelection(selection.modelId, selection.promptId, selection.fetchProvider);
    },
  );

  onSettled(() => {
    return () => {
      cancelStreamSubscription(chatState, 'app/unmount');
      resetLastEventId();
    };
  });

  return (
    <div class='relative flex h-screen w-screen overflow-hidden text-foreground'>
      <Sidebar />
      <div class='relative flex-1 z-0 min-w-0 flex flex-col gap-2 min-h-0'>
        <div class='flex shrink-0 h-16 items-center gap-3 px-4 bg-transparent'>
          <div class='flex-1' />
          <ArtifactToggleButton />
          <ShareButton />
          <NewChatButton variant='topbar' class='rounded-lg' />
        </div>
        <main class='relative flex flex-row flex-1 min-h-0 min-w-0'>
          <div class='@container relative h-full flex-1 min-w-0'>
            <Outlet />
            <Composer />
          </div>
          <ArtifactPanel />
        </main>
      </div>
    </div>
  );
}
