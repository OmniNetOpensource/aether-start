"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { useMessageTreeStore } from "@/features/chat/messages/store/useMessageTreeStore";
import { useConversationsStore } from "@/features/conversation/persistence/store/useConversationsStore";
import { ConversationItem } from "./ConversationItem";

type ConversationListProps = {
  scrollRootRef?: RefObject<HTMLDivElement | null>;
};

export function ConversationList({ scrollRootRef }: ConversationListProps) {
  const conversations = useConversationsStore((state) => state.conversations);
  const conversationsLoading = useConversationsStore(
    (state) => state.conversationsLoading
  );
  const loadInitialConversations = useConversationsStore(
    (state) => state.loadInitialConversations
  );
  const loadMoreConversations = useConversationsStore(
    (state) => state.loadMoreConversations
  );
  const hasLoaded = useConversationsStore((state) => state.hasLoaded);
  const loadingMore = useConversationsStore((state) => state.loadingMore);
  const hasMore = useConversationsStore((state) => state.hasMore);
  const activeConversationId = useMessageTreeStore(
    (state) => state.conversationId
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadInitialConversations();
  }, [loadInitialConversations]);

  useEffect(() => {
    if (!hasMore) {
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
        if (loadingMore || !hasMore) {
          return;
        }
        void loadMoreConversations();
      },
      {
        root: scrollRootRef?.current ?? null,
        rootMargin: "120px",
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRootRef, hasMore, loadingMore, loadMoreConversations]);

  if (conversationsLoading && !hasLoaded) {
    return (
      <div className="flex items-center justify-center py-6 text-(--text-tertiary)">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="ml-2 text-xs">加载会话中...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-2 text-2xs font-semibold uppercase tracking-[0.25em] text-(--text-tertiary)">
        最近
      </div>
      <div className="flex flex-col gap-1">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeConversationId}
          />
        ))}
      </div>
      {hasMore || loadingMore ? (
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
