import { startChatRequest } from '@/features/chat/agent-runtime/chat-orchestrator';
import { toast } from '@/shared/app-shell/useToast';
import { useChatRequestStore } from './useChatRequestStore';
import { useChatSessionStore } from '@/features/conversations/session';
import { cacheConversation, upsertConversationInCache } from '@/features/conversations/session';
import {
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
  type ComposerDocument,
} from '../composer-editor/composer-document';

// 校验输入，发送成功后清空 composer，并在必要时创建新会话后发起聊天请求
export async function submitMessage(
  document: ComposerDocument,
  navigateToNewChat: (conversationId: string) => Promise<void> | void,
  clearComposer: () => void,
) {
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  const currentModelId = sessionStore.currentModelId;
  const isBusy = requestStore.status !== 'idle';

  const hasModel = !!currentModelId;
  const hasPendingUpload = isComposerDocumentUploading(document);

  if (isBusy) {
    toast.warning('Wait for the current request to finish before sending another message.');
    return;
  }
  if (isComposerDocumentEmpty(document)) {
    toast.warning('Type a message before sending.');
    return;
  }
  if (!hasModel) {
    toast.warning('Select a model before sending a message.');
    return;
  }
  if (hasPendingUpload) {
    toast.warning('Attachments are still uploading. Please wait.');
    return;
  }

  const blocks = composerDocumentToBlocks(document);
  const parentId = sessionStore.currentPath.at(-1) ?? null;
  const previousSiblingId =
    parentId === null
      ? sessionStore.latestRootId
      : (sessionStore.messages[parentId - 1]?.latestChild ?? null);
  requestStore.setStatus('sending', 'submitMessage');

  const isNewConversation = !sessionStore.conversationId;

  await startChatRequest(
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

      const store = useChatSessionStore.getState();
      const now = response.message.createdAt;
      cacheConversation({
        id: response.conversationId,
        title: 'New Chat',
        model: store.currentModelId,
        is_pinned: false,
        pinned_at: null,
        currentPath: store.currentPath,
        messages: store.messages,
        artifacts: [],
        created_at: now,
        updated_at: now,
      });
      upsertConversationInCache({
        id: response.conversationId,
        title: 'New Chat',
        model: store.currentModelId,
        is_pinned: false,
        pinned_at: null,
        created_at: now,
        updated_at: now,
      });
      void navigateToNewChat(response.conversationId);
    },
  );
}
