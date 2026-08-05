import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSessionStateFn } from '@/features/auth/session';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      throw redirect({
        to: '/app/{-$conversationId}',
        params: { conversationId: undefined },
      });
    }

    throw redirect({ to: '/auth/login' });
  },
});
