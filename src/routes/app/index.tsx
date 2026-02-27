import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Composer } from "@/components/chat/composer/Composer";
import { MessageList } from "@/components/chat/message/MessageList";
import { useMessageTreeStore } from "@/stores/useMessageTreeStore";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { useEditingStore } from "@/stores/useEditingStore";
import { useComposerStore } from "@/stores/useComposerStore";
import { Sentry } from "@/lib/sentry";

export const Route = createFileRoute("/app/")({
  component: HomePage,
});

function HomePage() {
  const messages = useMessageTreeStore((state) => state.messages);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    useChatRequestStore.getState().clear();
    useEditingStore.getState().clear();
    const composer = useComposerStore.getState();
    const hasPrefill =
      composer.input.trim().length > 0 ||
      composer.pendingAttachments.length > 0;
    if (!hasPrefill) {
      composer.clear();
    }
    useMessageTreeStore.getState().clear();
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <main className="relative flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col relative">
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
