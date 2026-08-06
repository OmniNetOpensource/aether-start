import { createFileRoute, redirect } from '@tanstack/solid-router';

export const Route = createFileRoute('/auth/register')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const params = new URLSearchParams();

    if (typeof search.redirect === 'string') {
      params.set('redirect', search.redirect);
    }

    if (typeof search.email === 'string') {
      params.set('email', search.email);
    }

    const queryString = params.toString();
    throw redirect({ href: `/auth${queryString ? `?${queryString}` : ''}` });
  },
});
