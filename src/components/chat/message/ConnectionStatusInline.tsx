import { useEffect, useRef, useState } from "react";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { useChatRequestStore } from "@/stores/useChatRequestStore";
import { cn } from "@/lib/utils";

const CONNECTED_VISIBLE_MS = 2000;
const FADE_OUT_MS = 220;

export function ConnectionStatusInline() {
  const connectionState = useChatRequestStore((state) => state.connectionState);
  const connectionStateUpdatedAt = useChatRequestStore(
    (state) => state.connectionStateUpdatedAt
  );
  const [now, setNow] = useState(() => Date.now());
  const fadeStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fadeStartTimerRef.current) {
      clearTimeout(fadeStartTimerRef.current);
      fadeStartTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (connectionState === "connected") {
      const current = Date.now();
      const fadeStartAt = connectionStateUpdatedAt + CONNECTED_VISIBLE_MS;
      const hideAt = fadeStartAt + FADE_OUT_MS;

      fadeStartTimerRef.current = setTimeout(() => {
        setNow(Date.now());
      }, Math.max(0, fadeStartAt - current));

      hideTimerRef.current = setTimeout(() => {
        setNow(Date.now());
      }, Math.max(0, hideAt - current));
    }

    return () => {
      if (fadeStartTimerRef.current) {
        clearTimeout(fadeStartTimerRef.current);
        fadeStartTimerRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [connectionState, connectionStateUpdatedAt]);

  if (connectionState === "idle") {
    return null;
  }

  const elapsed = now - connectionStateUpdatedAt;
  const shouldHideConnected =
    connectionState === "connected" &&
    elapsed >= CONNECTED_VISIBLE_MS + FADE_OUT_MS;
  if (shouldHideConnected) {
    return null;
  }

  const fadingOut =
    connectionState === "connected" &&
    elapsed >= CONNECTED_VISIBLE_MS;

  const isConnecting = connectionState === "connecting";
  const isConnected = connectionState === "connected";
  const isReconnecting = connectionState === "reconnecting";

  const text = isConnecting
    ? "正在建立实时连接..."
    : isConnected
    ? "实时连接已建立"
    : isReconnecting
    ? "连接中断，正在重连..."
    : "实时连接已断开";

  const toneClass = isConnecting || isConnected
    ? "border-(--status-info)/30 bg-(--status-info)/10 text-(--status-info)"
    : isReconnecting
    ? "border-(--status-warning)/35 bg-(--status-warning)/10 text-(--status-warning)"
    : "border-(--status-destructive)/30 bg-(--status-destructive)/10 text-(--status-destructive)";

  return (
    <div className="mt-3 flex w-full items-center">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-opacity duration-200",
          toneClass,
          fadingOut ? "opacity-0" : "opacity-100"
        )}
      >
        {isConnecting || isReconnecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isConnected ? (
          <Wifi className="h-3.5 w-3.5" />
        ) : (
          <WifiOff className="h-3.5 w-3.5" />
        )}
        <span>{text}</span>
      </div>
    </div>
  );
}
