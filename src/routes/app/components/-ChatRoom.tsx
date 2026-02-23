import { NewChatButton } from "@/features/chat/session/components/NewChatButton";
import { ShareButton } from "@/features/chat/share/components/ShareButton";

interface ChatRoomProps {
  children: React.ReactNode;
}

export function ChatRoom({ children }: ChatRoomProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex h-16 items-center gap-3 px-4 bg-transparent">
        <div className="flex-1" />
        <ShareButton />
        <NewChatButton variant="topbar" className="rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden">
        {children}
      </div>
    </div>
  );
}
