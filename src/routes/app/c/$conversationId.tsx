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

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

export function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { isLoading } = useConversationLoader(conversationId);

  const conversations = useConversationsStore((state) => state.conversations);
  const title = conversations.find((c) => c.id === conversationId)?.title;


  // 根据当前会话标题同步浏览器标签页标题，离开时恢复默认
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
    let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let sseReconnectAttempt = 0;
    const sseAbortController = new AbortController();
    const clearSseReconnectTimer = () => {
      if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
      }
    };

    const connectSseStream = (markConnecting = false) => {
      const { connectionState, setConnectionState } =
        useChatRequestStore.getState();

      if (
        sseAbortController.signal.aborted ||
        connectionState === "connecting"
      ) {
        return;
      }

      if (markConnecting) {
        setConnectionState("connecting");
      }

      resumeRunningConversation(conversationId, sseAbortController.signal).catch(
        () => {},
      );
    };

    const syncSseReconnect = () => {
      clearSseReconnectTimer();

      const { connectionState, requestPhase } = useChatRequestStore.getState();

      if (
        requestPhase === "done" ||
        connectionState === "idle" ||
        connectionState === "connected"
      ) {
        sseReconnectAttempt = 0;
        return;
      }

      if (connectionState !== "disconnected") {
        return;
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }

      const delay =
        RECONNECT_DELAYS_MS[
          Math.min(
            sseReconnectAttempt,
            RECONNECT_DELAYS_MS.length - 1,
          )
        ];

      sseReconnectTimer = setTimeout(() => {
        sseReconnectTimer = null;
        sseReconnectAttempt += 1;
        connectSseStream(true);
      }, delay);
    };

    const handleSseOffline = () => {
      clearSseReconnectTimer();

      const { requestPhase, setConnectionState } =
        useChatRequestStore.getState();

      if (requestPhase === "done") {
        return;
      }

      setConnectionState("disconnected");
    };

    const handleSseOnline = () => {
      clearSseReconnectTimer();

      const { connectionState, requestPhase } = useChatRequestStore.getState();

      if (requestPhase === "done" || connectionState === "connecting") {
        return;
      }

      connectSseStream(true);
    };

    const unsubscribeRequestState = useChatRequestStore.subscribe(
      syncSseReconnect,
    );

    syncSseReconnect();
    window.addEventListener("offline", handleSseOffline);
    window.addEventListener("online", handleSseOnline);

    return () => {
      unsubscribeRequestState();
      clearSseReconnectTimer();
      sseReconnectAttempt = 0;
      window.removeEventListener("offline", handleSseOffline);
      window.removeEventListener("online", handleSseOnline);
      sseAbortController.abort();
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
