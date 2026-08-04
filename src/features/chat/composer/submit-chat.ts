import { startChatRequest } from '@/features/chat/agent-runtime/chat-orchestrator';
import { toast } from '@/shared/app-shell/useToast';
import { useChatRequestStore } from '@/features/chat/composer/useChatRequestStore';
import { useChatSessionStore } from '@/features/conversations/session';
import { upsertConversationInCache } from '@/features/conversations/session';
import { useComposerStore } from './useComposerStore';
import {
  composerDocumentToBlocks,
  isComposerDocumentEmpty,
  isComposerDocumentUploading,
} from './composer-document';

// 校验输入，发送成功后清空 composer，并在必要时创建新会话后发起聊天请求
export async function submitMessage(
  navigateToNewChat: (conversationId: string) => Promise<void> | void,
  navigateToNewChatHome: () => Promise<void> | void,
) {
  const composerStore = useComposerStore.getState();
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  const document = composerStore.document;
  const currentModelId = sessionStore.currentModelId;
  const isBusy = requestStore.status !== 'idle';

  const hasModel = !!currentModelId;
  const hasPendingUpload = isComposerDocumentUploading(document);

  if (isBusy || isComposerDocumentEmpty(document) || !hasModel || hasPendingUpload) {
    if (!hasModel) {
      toast.warning('Select a model before sending a message.');
    }
    return;
  }

  sessionStore.addMessage('user', composerDocumentToBlocks(document));
  requestStore.setStatus('sending', 'submitMessage');
  composerStore.clear();

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

  await startChatRequest({ onEmptyConversationRollback: navigateToNewChatHome });
}
