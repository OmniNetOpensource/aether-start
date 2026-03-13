import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Composer } from "@/features/chat/components/composer/Composer";
import { MessageList } from "@/features/chat/components/message/MessageList";
import {
  resetLastEventId,
  resumeRunningConversation,
} from "@/features/chat/lib/api/chat-orchestrator";
import { useChatRequestStore } from "@/features/chat/store/useChatRequestStore";
import { useConversationLoader } from "@/features/sidebar/hooks/useConversationLoader";
import { useChatSessionStore } from "@/features/sidebar/store/useChatSessionStore";

export const Route = createFileRoute("/app/c/$conversationId")({
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { isLoading } = useConversationLoader(conversationId);
  const conversations = useChatSessionStore((state) => state.conversations);
  const title = conversations.find((item) => item.id === conversationId)?.title;

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
    const abortController = new AbortController();

    resumeRunningConversation(conversationId, abortController.signal).catch(
      () => {},
    );

    return () => {
      abortController.abort();
      resetLastEventId();
      useChatRequestStore.getState().setStatus("idle");
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
