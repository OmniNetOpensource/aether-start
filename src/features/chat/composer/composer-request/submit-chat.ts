import { startChatRequest } from '@/features/chat/agent-runtime/chat-orchestrator';
import { toast } from '@/shared/app-shell/useToast';
import { useChatRequestStore } from './useChatRequestStore';
import { useChatSessionStore } from '@/features/conversations/session';
import { upsertConversationInCache } from '@/features/conversations/session';
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

  sessionStore.addMessage('user', composerDocumentToBlocks(document));
  requestStore.setStatus('sending', 'submitMessage');
  clearComposer();

  if (!sessionStore.conversationId) {
    const conversationId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();

    sessionStore.setConversationId(conversationId);
    await navigateToNewChat(conversationId);
    upsertConversationInCache({
      id: conversationId,
      title: 'New Chat',
      model: sessionStore.currentModelId,
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  await startChatRequest();
}
