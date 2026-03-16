import { startChatRequest } from "@/lib/chat/api/chat-orchestrator";
import { buildUserBlocks } from "@/lib/conversation/tree/block-operations";
import { toast } from "@/hooks/useToast";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useComposerStore } from "@/stores/zustand/useComposerStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";

/** 校验、写入消息、清空输入、确保对话存在并发起聊天请求 */
export async function submitMessage(
  navigateToNewChat: (conversationId: string) => void,
) {
  const composerStore = useComposerStore.getState();
  const requestStore = useChatRequestStore.getState();
  const sessionStore = useChatSessionStore.getState();

  const input = composerStore.input;
  const pendingAttachments = composerStore.pendingAttachments;
  const currentRole = sessionStore.currentRole;
  const isBusy = requestStore.status !== "idle";

  const trimmed = input.trim();
  const hasContent = trimmed.length > 0;
  const hasAttachment = pendingAttachments.length > 0;
  const hasRole = !!currentRole;

  if (isBusy || (!hasContent && !hasAttachment) || !hasRole) {
    if (!hasRole) {
      toast.warning("Select a role before sending a message.");
    }
    return;
  }

  sessionStore.addMessage("user", buildUserBlocks(input, pendingAttachments));

  composerStore.clear();

  if (!sessionStore.conversationId) {
    const conversationId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();

    sessionStore.setConversationId(conversationId);
    sessionStore.addConversation({
      id: conversationId,
      title: "New Chat",
      role: sessionStore.currentRole,
      is_pinned: false,
      pinned_at: null,
      created_at: now,
      updated_at: now,
    });
    navigateToNewChat(conversationId);
  }

  await startChatRequest();
}
