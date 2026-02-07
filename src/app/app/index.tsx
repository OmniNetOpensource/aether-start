import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Composer } from "@/src/features/chat/components/composer/Composer";
import { MessageList } from "@/src/features/chat/components/message/display/MessageList";
import { useMessageTreeStore } from "@/src/features/chat/store/useMessageTreeStore";
import { useChatRequestStore } from "@/src/features/chat/store/useChatRequestStore";
import { useEditingStore } from "@/src/features/chat/store/useEditingStore";
import { useComposerStore } from "@/src/features/chat/store/useComposerStore";

export const Route = createFileRoute("/app/")({
  component: HomePage,
});

function HomePage() {
  const messages = useMessageTreeStore((state) => state.messages);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    useChatRequestStore.getState().clear();
    useEditingStore.getState().clear();
    useComposerStore.getState().clear();
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
