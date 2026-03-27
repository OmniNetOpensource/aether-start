import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getSessionFromRequest } from '@/features/auth/server/session';
import { isAdminEmail } from '@/features/auth/server/admin';

export const getSessionStateFn = createServerFn({ method: 'GET' }).handler(async () => {
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
