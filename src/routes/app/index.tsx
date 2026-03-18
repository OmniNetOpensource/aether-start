import { useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Composer } from "@/components/chat/composer/Composer";
import { MessageList } from "@/components/chat/message/MessageList";
import { useComposerStore } from "@/stores/zustand/useComposerStore";
import { useChatRequestStore } from "@/stores/zustand/useChatRequestStore";
import { useEditingStore } from "@/stores/zustand/useEditingStore";
import { useChatSessionStore } from "@/stores/zustand/useChatSessionStore";

function initNewChatPage() {
  if (typeof window === "undefined") return;

  useChatRequestStore.getState().setStatus("idle", "new_chat/enter");
  useEditingStore.getState().clear();
  const composer = useComposerStore.getState();
  const hasPrefill =
    composer.input.trim().length > 0 ||
    composer.pendingAttachments.length > 0 ||
    (typeof window.__preHydrationInput === "string" &&
      window.__preHydrationInput.trim().length > 0);
  if (!hasPrefill) {
    composer.clear();
  }
  useChatSessionStore.getState().clearSession();
}

export const Route = createFileRoute("/app/")({
  beforeLoad: initNewChatPage,
  component: HomePage,
});

function HomePage() {
  const messages = useChatSessionStore((state) => state.messages);
  const hasMessages = messages.length > 0;
  const chatAreaRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full w-full flex-col">
      <main className="relative flex-1 min-h-0 flex">
        <div
          ref={chatAreaRef}
          className="@container flex-1 min-w-0 flex flex-col relative"
        >
          {hasMessages && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <MessageList />
              </div>
            </div>
          )}
          <Composer />
        </div>
      </main>
    </div>
  );
}
