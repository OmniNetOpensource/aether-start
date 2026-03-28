import { createServerFn } from '@tanstack/react-start';

export const getSessionStateFn = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ getSessionFromRequest }, { isAdminEmail }, { getRequest }] = await Promise.all([
    import('./request.server'),
    import('../admin-access/admin.server'),
    import('@tanstack/react-start/server'),
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
