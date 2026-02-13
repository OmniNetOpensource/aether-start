import { NewChatButton } from "@/features/chat/session/components/NewChatButton";
import { useResponsive } from "@/features/responsive/ResponsiveContext";
import { SidebarToggleButton } from "@/features/sidebar/layout/components/SidebarToggleButton";

interface ChatRoomProps {
  children: React.ReactNode;
}

export function ChatRoom({ children }: ChatRoomProps) {
  const deviceType = useResponsive();
  const isDesktop = deviceType === "desktop";

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex h-16 items-center gap-3 px-4 bg-transparent">
        {!isDesktop ? <SidebarToggleButton /> : null}
        <div className="flex-1" />
        <NewChatButton variant="topbar" className="rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden">
        {children}
      </div>
    </div>
  );
}
