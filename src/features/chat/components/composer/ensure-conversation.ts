import { appNavigate } from "@/lib/navigation";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";

/** 无 conversationId 时创建新对话并导航，确保 store 中有 conversationId */
export function ensureConversation() {
  const sessionStore = useChatSessionStore.getState();
  if (sessionStore.conversationId) return;

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
  appNavigate(`/app/c/${conversationId}?new_chat=true`);
}
