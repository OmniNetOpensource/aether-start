import { startChatRequest } from '@/features/chat/request/chat-orchestrator';
import { buildUserBlocks } from '@/features/sidebar/tree/block-operations';
import { toast } from '@/hooks/useToast';
import { useChatRequestStore } from '@/features/chat/request/useChatRequestStore';
import { useChatSessionStore } from '@/features/sidebar/useChatSessionStore';
import { useComposerStore } from './useComposerStore';

// 校验输入、清空草稿，并在必要时创建新会话后发起聊天请求
export async function submitMessage(navigateToNewChat: (conversationId: string) => void) {
  const composerStore = useComposerStore.getState();
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  const input = composerStore.input;
  const pendingAttachments = composerStore.pendingAttachments;
  const pendingQuotes = composerStore.pendingQuotes;
  const currentRole = sessionStore.currentRole;
  const isBusy = requestStore.status !== 'idle';

  const trimmed = input.trim();
  const hasContent = trimmed.length > 0;
  const hasAttachment = pendingAttachments.length > 0;
  const hasQuotes = pendingQuotes.length > 0;
  const hasRole = !!currentRole;

  if (isBusy || (!hasContent && !hasAttachment && !hasQuotes) || !hasRole) {
    if (!hasRole) {
      toast.warning('Select a role before sending a message.');
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
    sessionStore.addConversation({
      id: conversationId,
      title: 'New Chat',
      role: sessionStore.currentRole,
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  await startChatRequest();
}
