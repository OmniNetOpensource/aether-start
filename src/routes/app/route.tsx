import { Outlet, createFileRoute } from "@tanstack/react-router";
import Sidebar from "@/features/sidebar/components/Sidebar";
import { ChatRoom } from "@/routes/app/components/-ChatRoom";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden text-foreground">
      <Sidebar />
      <div className="relative flex-1 min-w-0 flex">
        <ChatRoom>
          <Outlet />
        </ChatRoom>
      </div>
    </div>
  );
}
