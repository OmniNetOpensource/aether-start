import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Composer } from "@/src/features/chat/components/composer/Composer";
import { MessageList } from "@/src/features/chat/components/message/display/MessageList";
import { useConversationLoader } from "@/src/features/chat/hooks/useConversationLoader";
import { useConversationsStore } from "@/src/features/sidebar/store/useConversationsStore";
import { localDB } from "@/src/shared/lib/indexed-db";

export const Route = createFileRoute("/app/c/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { isLoading } = useConversationLoader(conversationId);

  const pinnedConversations = useConversationsStore((s) => s.pinnedConversations);
  const normalConversations = useConversationsStore((s) => s.normalConversations);

  const currentConversation = [...pinnedConversations, ...normalConversations].find(
    (c) => c.id === conversationId,
  );
  const storeTitle = currentConversation?.title;

  const [dbTitle, setDbTitle] = useState<string | null>(null);

  useEffect(() => {
    if (storeTitle || !conversationId) {
      return;
    }

    const loadTitle = async () => {
      try {
        const conversation = await localDB.get(conversationId);
        if (conversation?.title) {
          setDbTitle(conversation.title);
        }
      } catch (error) {
        console.error("Failed to load conversation title:", error);
      }
    };

    void loadTitle();
  }, [conversationId, storeTitle]);

  const title = storeTitle ?? dbTitle;

  useEffect(() => {
    const defaultTitle = "Aether";

    if (title) {
      const truncatedTitle = title.length > 50 ? `${title.slice(0, 50)}...` : title;
      document.title = `${truncatedTitle} - Aether`;
    } else {
      document.title = defaultTitle;
    }

    return () => {
      document.title = defaultTitle;
    };
  }, [title]);

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <main className="relative flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col relative">
          <MessageList />
          <Composer />
        </div>
      </main>
    </div>
  );
}
