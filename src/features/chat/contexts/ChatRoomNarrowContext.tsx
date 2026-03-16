"use client";

import { createContext, useContext, useEffect, useState } from "react";

const CHAT_ROOM_NARROW_THRESHOLD = 760;

const ChatRoomNarrowContext = createContext<boolean>(true);

export function ChatRoomNarrowProvider({
  containerRef,
  children,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [narrow, setNarrow] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setNarrow(w < CHAT_ROOM_NARROW_THRESHOLD);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return (
    <ChatRoomNarrowContext.Provider value={narrow}>
      {children}
    </ChatRoomNarrowContext.Provider>
  );
}

export function useChatRoomNarrow() {
  return useContext(ChatRoomNarrowContext);
}
