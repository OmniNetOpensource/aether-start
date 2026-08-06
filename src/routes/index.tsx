import { createFileRoute, redirect } from '@tanstack/solid-router';
import { getSessionStateFn } from '@/rpc/auth';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      throw redirect({
        to: '/app',
      });
    }

    throw redirect({
      to: '/auth/login',
      search: { redirect: undefined, email: undefined, reset: undefined },
    });
  },
});
