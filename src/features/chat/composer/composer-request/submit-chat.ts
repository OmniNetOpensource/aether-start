import { startChatRequest } from '@/features/chat/agent-runtime/chat-orchestrator';
import type { ChatRuntimeState } from '@/features/chat/agent-runtime/chat-runtime-state';
import { cacheConversation, upsertConversationInCache } from '@/features/conversations/session';
import {
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from '../composer-editor/composer-document';

// 校验输入，发送成功后清空 composer，并在必要时创建新会话后发起聊天请求
export async function submitMessage(
  runtime: ChatRuntimeState,
  document: ComposerDocument,
  navigateToNewChat: (conversationId: string) => Promise<void> | void,
  clearComposer: () => void,
) {
  const sessionState = runtime.getSession();

  const currentModelId = sessionState.currentModelId;
  const isBusy = runtime.getStatus() !== 'idle';

  const hasModel = !!currentModelId;
  const hasPendingUpload = isComposerDocumentUploading(document);

  if (isBusy) {
    runtime.toast.warning('Wait for the current request to finish before sending another message.');
    return;
  }
  if (isComposerDocumentEmpty(document)) {
    runtime.toast.warning('Type a message before sending.');
    return;
  }
  if (!hasModel) {
    runtime.toast.warning('Select a model before sending a message.');
    return;
  }
  if (hasPendingUpload) {
    runtime.toast.warning('Attachments are still uploading. Please wait.');
    return;
  }

  const blocks = composerDocumentToBlocks(document);
  const parentId = sessionState.currentPath.at(-1) ?? null;
  const previousSiblingId =
    parentId === null
      ? sessionState.latestRootId
      : (sessionState.messages[parentId - 1]?.latestChild ?? null);
  runtime.setStatus('sending');

  const isNewConversation = !sessionState.conversationId;

  await startChatRequest(
    runtime,
    {
      type: 'append',
      message: { role: 'user', blocks },
      parentId,
      previousSiblingId,
    },
    (response) => {
      clearComposer();
      if (!isNewConversation) {
        return;
      }

      if (response.type !== 'append') {
        throw new Error('New conversation did not return a user message');
      }

      const state = runtime.getSession();
      const now = response.message.createdAt;
      cacheConversation({
        id: response.conversationId,
        title: 'New Chat',
        model: state.currentModelId,
        is_pinned: false,
        pinned_at: null,
        currentPath: state.currentPath,
        messages: state.messages,
        artifacts: [],
        created_at: now,
        updated_at: now,
      });
      upsertConversationInCache({
        id: response.conversationId,
        title: 'New Chat',
        model: state.currentModelId,
        is_pinned: false,
        pinned_at: null,
        created_at: now,
        updated_at: now,
      });
      void navigateToNewChat(response.conversationId);
    },
  );
}
