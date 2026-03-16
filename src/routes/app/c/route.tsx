import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/c")({
  component: ChatRoomLayout,
});

function ChatRoomLayout() {
  return <Outlet />;
}
