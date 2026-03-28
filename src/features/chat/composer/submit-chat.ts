import { startChatRequest } from '@/features/chat/session';
import { buildUserBlocks } from '@/features/conversations/conversation-tree';
import { toast } from '@/shared/app-shell/useToast';
import { useChatRequestStore } from '@/features/chat/session';
import { useChatSessionStore } from '@/features/conversations/session';
import { upsertConversationInCache } from '@/features/conversations/session';
import { useComposerStore } from './useComposerStore';

// 校验输入，发送成功后清空 composer，并在必要时创建新会话后发起聊天请求
export async function submitMessage(navigateToNewChat: (conversationId: string) => void) {
  const composerStore = useComposerStore.getState();
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  const input = composerStore.input;
  const pendingAttachments = composerStore.pendingAttachments;
  const pendingQuotes = composerStore.pendingQuotes;
  const currentModelId = sessionStore.currentModelId;
  const isBusy = requestStore.status !== 'idle';

  const trimmed = input.trim();
  const hasContent = trimmed.length > 0;
  const hasAttachment = pendingAttachments.length > 0;
  const hasQuotes = pendingQuotes.length > 0;
  const hasModel = !!currentModelId;

  if (isBusy || (!hasContent && !hasAttachment && !hasQuotes) || !hasModel) {
    if (!hasModel) {
      toast.warning('Select a model before sending a message.');
    }
    return;
  }

  sessionStore.addMessage('user', buildUserBlocks(input, pendingQuotes, pendingAttachments));
  composerStore.clear();

  if (!sessionStore.conversationId) {
    const conversationId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();

    sessionStore.setConversationId(conversationId);
    navigateToNewChat(conversationId);
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
