import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Composer } from "@/features/chat/components/composer/Composer";
import { MessageList } from "@/features/chat/components/message/MessageList";
import { useConversationLoader } from "@/features/sidebar/hooks/useConversationLoader";
import {
  resetLastEventId,
  resumeRunningConversation,
} from "@/features/chat/lib/api/chat-orchestrator";
import { useChatRequestStore } from "@/features/chat/store/useChatRequestStore";
import { useConversationsStore } from "@/features/sidebar/store/useConversationsStore";

export const Route = createFileRoute("/app/c/$conversationId")({
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { isLoading } = useConversationLoader(conversationId);

  const title = useConversationsStore(
    (state) => state.conversations.find((c) => c.id === conversationId)?.title,
  );

  useEffect(() => {
    const defaultTitle = "Aether";

    if (title) {
      const truncatedTitle =
        title.length > 50 ? `${title.slice(0, 50)}...` : title;
      document.title = `${truncatedTitle} - Aether`;
    } else {
      document.title = defaultTitle;
    }

    return () => {
      document.title = defaultTitle;
    };
  }, [title]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    resetLastEventId();

    const ac = new AbortController();

    resumeRunningConversation(conversationId, ac.signal).catch(() => {});

    return () => {
      ac.abort();
      resetLastEventId();
      useChatRequestStore.getState().clearRequestState();
      useChatRequestStore.getState().setConnectionState("idle");
    };
  }, [conversationId]);

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <main className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <MessageList />
          <Composer />
        </div>
      </main>
    </div>
  );
}
