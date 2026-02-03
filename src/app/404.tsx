import { createFileRoute } from "@tanstack/react-router";
import { NotFound } from "@/src/app/-not-found";

export const Route = createFileRoute("/404")({
  component: NotFound,
});
