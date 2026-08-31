import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
    reset: typeof search.reset === 'string' ? search.reset : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const params = new URLSearchParams();

    if (typeof search.redirect === 'string') {
      params.set('redirect', search.redirect);
    }

    if (typeof search.email === 'string') {
      params.set('email', search.email);
    }

    if (typeof search.reset === 'string') {
      params.set('reset', search.reset);
    }

    const queryString = params.toString();
    throw redirect({ href: `/auth${queryString ? `?${queryString}` : ''}` });
  },
});
