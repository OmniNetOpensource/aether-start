import { useRef } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Composer } from "@/features/chat/components/composer/Composer";
import { ArtifactPanel } from "@/features/chat/components/artifact/ArtifactPanel";
import { MessageList } from "@/features/chat/components/message/MessageList";
import { ChatRoomNarrowProvider } from "@/features/chat/contexts/ChatRoomNarrowContext";
import { useConversationLoader } from "@/features/sidebar/hooks/useConversationLoader";
import { getConversationFn } from "@/server/functions/conversations";

export const Route = createFileRoute("/app/c/$conversationId")({
  validateSearch: (search) => ({
    new_chat:
      (search as Record<string, unknown>)?.new_chat === "true" ||
      (search as Record<string, unknown>)?.new_chat === true,
  }),
  loaderDeps: ({ search }) => ({ new_chat: search.new_chat }),
  loader: async ({ params, deps }) => {
    if (deps.new_chat) {
      return { newChat: true };
    }
    const conversation = await getConversationFn({
      data: { id: params.conversationId },
    });
    if (!conversation) {
      throw redirect({ to: "/404", replace: true });
    }
    return { conversation };
  },
  component: ConversationPage,
});

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const { isLoading } = useConversationLoader(conversationId, loaderData);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col">
      <main className="relative flex min-h-0 flex-1">
        <ChatRoomNarrowProvider containerRef={chatAreaRef}>
          <div
            ref={chatAreaRef}
            className="relative flex min-w-0 flex-1 flex-col"
          >
            <MessageList />
            <Composer />
          </div>
        </ChatRoomNarrowProvider>
        <ArtifactPanel />
      </main>
    </div>
  );
}
