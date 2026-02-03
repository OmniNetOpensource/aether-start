import { NewChatButton } from "@/src/features/sidebar/components/NewChatButton";
import { SidebarToggleButton } from "@/src/features/sidebar/components/SidebarToggleButton";

interface ChatRoomProps {
  children: React.ReactNode;
}

export function ChatRoom({ children }: ChatRoomProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex items-center h-12 px-1 border border-b-0 border-(--border-primary) rounded-t-xl bg-(--surface-primary)">
        <SidebarToggleButton />
        <div className="flex-1" />
        <NewChatButton variant="topbar" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col border border-t-0 border-(--border-primary) rounded-b-xl bg-(--surface-primary) overflow-hidden">
        {children}
      </div>
    </div>
  );
}
