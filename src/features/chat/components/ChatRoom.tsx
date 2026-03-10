import { NewChatButton } from "@/features/chat/components/NewChatButton";
import { OutlineButton } from "@/features/chat/components/outline/OutlineButton";
import { ShareButton } from "@/features/share/components/ShareButton";

interface ChatRoomProps {
  children: React.ReactNode;
}

export function ChatRoom({ children }: ChatRoomProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex h-16 items-center gap-3 px-4 bg-transparent">
        <div className="flex-1" />
        <OutlineButton />
        <ShareButton />
        <NewChatButton variant="topbar" className="rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden">
        {children}
      </div>
    </div>
  );
}
