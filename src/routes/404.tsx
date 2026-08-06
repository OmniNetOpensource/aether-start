import { createFileRoute } from '@tanstack/solid-router';
import { NotFound } from '@/routes/-not-found';

export const Route = createFileRoute('/404')({
  component: NotFound,
});
