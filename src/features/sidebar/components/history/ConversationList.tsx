"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useMessageTreeStore } from "@/src/features/chat/store";
import { useConversationsStore } from "@/src/features/sidebar/store/useConversationsStore";
import { ConversationItem } from "./ConversationItem";

export function ConversationList() {
  const pinnedConversations = useConversationsStore(
    (state) => state.pinnedConversations
  );
  const normalConversations = useConversationsStore(
    (state) => state.normalConversations
  );
  const conversationsLoading = useConversationsStore(
    (state) => state.conversationsLoading
  );
  const loadLocalConversations = useConversationsStore(
    (state) => state.loadLocalConversations
  );
  const hasLoadedLocal = useConversationsStore((state) => state.hasLoadedLocal);
  const activeConversationId = useMessageTreeStore(
    (state) => state.conversationId
  );

  useEffect(() => {
    void loadLocalConversations();
  }, [loadLocalConversations]);

  if (conversationsLoading && !hasLoadedLocal) {
    return (
      <div className="flex items-center justify-center py-6 text-(--text-tertiary)">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="ml-2 text-xs">加载会话中...</span>
      </div>
    );
  }

  if (
    !pinnedConversations.length &&
    !normalConversations.length &&
    hasLoadedLocal
  ) {
    return (
      <div className="rounded-xl border border-dashed border-(--border-primary) bg-(--surface-primary)/50 p-4 text-center text-xs text-(--text-tertiary)">
        暂无会话，发送第一条消息后会自动出现在这里。
      </div>
    );
  }

  const hasPinned = pinnedConversations.length > 0;
  const hasRegular = normalConversations.length > 0;

  return (
    <div className="flex flex-col gap-1">
      {hasPinned ? (
        <>
          <div className="px-3 py-1 text-[11px] font-medium text-(--text-tertiary)">
            置顶
          </div>
          <div className="flex flex-col gap-1">
            {pinnedConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
              />
            ))}
          </div>
        </>
      ) : null}
      {hasPinned && hasRegular ? (
        <div className="my-2 h-px w-full bg-(--border-primary)" />
      ) : null}
      {hasRegular ? (
        <>
          <div className="px-3 py-1 text-[11px] font-medium text-(--text-tertiary)">
            最近
          </div>
          <div className="flex flex-col gap-1">
            {normalConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
