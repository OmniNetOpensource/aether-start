import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/login')({
  beforeLoad: async ({ search }) => {
    const params = new URLSearchParams();
    const nextSearch = search as Record<string, string | undefined>;

    if (nextSearch.redirect) {
      params.set('redirect', nextSearch.redirect);
    }

    if (nextSearch.email) {
      params.set('email', nextSearch.email);
    }

    if (nextSearch.reset) {
      params.set('reset', nextSearch.reset);
    }

    const queryString = params.toString();
    throw redirect({ href: `/auth${queryString ? `?${queryString}` : ''}` });
  },
});
