import { Outlet, createFileRoute } from "@tanstack/react-router";
import { NewChatButton } from "@/features/chat/components/NewChatButton";
import { ArtifactToggleButton } from "@/features/chat/components/artifact/ArtifactPanel";
import { OutlineButton } from "@/features/chat/components/outline";
import { ShareButton } from "@/features/share/components/ShareButton";

export const Route = createFileRoute("/app/c")({
  component: ChatRoomLayout,
});

function ChatRoomLayout() {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex h-16 items-center gap-3 px-4 bg-transparent">
        <div className="flex-1" />
        <ArtifactToggleButton />
        <OutlineButton />
        <ShareButton />
        <NewChatButton variant="topbar" className="rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-transparent overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
