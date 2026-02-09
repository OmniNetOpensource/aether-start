"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { useMessageTreeStore } from "@/features/chat/store/useMessageTreeStore";
import { useConversationsStore } from "@/features/sidebar/store/useConversationsStore";
import { ConversationItem } from "./ConversationItem";

type ConversationListProps = {
  scrollRootRef?: RefObject<HTMLDivElement | null>;
};

export function ConversationList({ scrollRootRef }: ConversationListProps) {
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
  const loadMoreLocalConversations = useConversationsStore(
    (state) => state.loadMoreLocalConversations
  );
  const hasLoadedLocal = useConversationsStore((state) => state.hasLoadedLocal);
  const loadingMore = useConversationsStore((state) => state.loadingMore);
  const hasMoreLocal = useConversationsStore((state) => state.hasMoreLocal);
  const activeConversationId = useMessageTreeStore(
    (state) => state.conversationId
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadLocalConversations();
  }, [loadLocalConversations]);

  useEffect(() => {
    if (!hasMoreLocal) {
      return;
    }

    const target = sentinelRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        if (loadingMore || !hasMoreLocal) {
          return;
        }
        void loadMoreLocalConversations();
      },
      {
        root: scrollRootRef?.current ?? null,
        rootMargin: "120px",
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRootRef, hasMoreLocal, loadingMore, loadMoreLocalConversations]);

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
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-(--text-tertiary)">
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
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-(--text-tertiary)">
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
      {hasMoreLocal || loadingMore ? (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-3 text-(--text-tertiary)"
        >
          {loadingMore ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-xs">加载更多...</span>
            </>
          ) : (
            <span className="text-xs">滚动加载更多...</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
