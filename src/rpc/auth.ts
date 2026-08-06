import { createServerFn } from '@tanstack/solid-start';

export const getSessionStateFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ getSessionFromRequest }, { isAdminEmail }, { getRequest }] = await Promise.all([
    import('@/backend/auth/request'),
    import('@/backend/auth/admin-access'),
    import('@tanstack/solid-start/server'),
  ]);
  const session = await getSessionFromRequest(getRequest());

  return {
    isAuthenticated: !!session,
    isAdmin: session ? isAdminEmail(session.user.email) : false,
    user: session
      ? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        }
      : null,
  };
});
