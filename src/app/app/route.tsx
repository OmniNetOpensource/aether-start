import { Outlet, createFileRoute } from "@tanstack/react-router";
import Sidebar from "@/src/features/sidebar/components/Sidebar";
import { ChatRoom } from "@/src/app/app/components/-ChatRoom";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="relative flex h-screen w-screen bg-(--surface-primary) text-foreground">
      <Sidebar />
      <div className="relative flex-1 min-w-0 flex gap-2 p-2 md:p-3 lg:p-4">
        <ChatRoom>
          <Outlet />
        </ChatRoom>
      </div>
    </div>
  );
}
