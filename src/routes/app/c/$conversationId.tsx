import { useEffect, useRef } from "react";
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
  const status = useChatRequestStore((state) => state.status);
  const connectionState = useChatRequestStore((state) => state.connectionState);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const resumeConversationRef = useRef<
    ((clearRequestStateWhenNotRunning?: boolean) => void) | null
  >(null);

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
    resetLastEventId();

    const ac = new AbortController();
    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const resumeConversation = (clearRequestStateWhenNotRunning = false) => {
      const store = useChatRequestStore.getState();

      if (ac.signal.aborted || store.connectionState === "connecting") {
        return;
      }

      if (clearRequestStateWhenNotRunning) {
        store.setConnectionState("connecting");
      }

      resumeRunningConversation(conversationId, ac.signal, {
        clearRequestStateWhenNotRunning,
      }).catch(() => {});
    };
    resumeConversationRef.current = resumeConversation;

    const handleOffline = () => {
      const store = useChatRequestStore.getState();

      clearReconnectTimer();

      if (store.status === "done") {
        return;
      }

      store.setConnectionState("disconnected");
    };

    const handleOnline = () => {
      const store = useChatRequestStore.getState();

      clearReconnectTimer();

      if (store.status === "done" || store.connectionState === "connecting") {
        return;
      }

      resumeConversation(true);
    };

    resumeConversation();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      resumeConversationRef.current = null;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      ac.abort();
      resetLastEventId();
      useChatRequestStore.getState().clearRequestState();
      useChatRequestStore.getState().setConnectionState("idle");
    };
  }, [conversationId]);

  useEffect(() => {
    // 状态变化会频繁触发这个 effect，先清掉旧的重试定时器，
    // 避免重复排队多个重连任务。
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // 请求已经结束，或者连接已经恢复正常时，停止重试并重置退避计数。
    if (
      status === "done" ||
      connectionState === "idle" ||
      connectionState === "connected"
    ) {
      reconnectAttemptRef.current = 0;
      return;
    }

    if (connectionState !== "disconnected") {
      return;
    }

    // 浏览器离线时不主动轮询，等 online 事件触发后再恢复。
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }

    // 使用有上限的退避重试，避免断线后持续高频请求服务端。
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)
      ];

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectAttemptRef.current += 1;
      resumeConversationRef.current?.(true);
    }, delay);

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectionState, conversationId, status]);

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
