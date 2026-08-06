import { createSignal } from 'solid-js';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { useMountEffect } from '@/shared/app-shell/useMountEffect';

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.BETTER_AUTH_URL ?? 'http://localhost:3100'),
  plugins: [emailOTPClient()],
});

export function useAuthSession() {
  const [session, setSession] = createSignal(authClient.useSession.get());
  useMountEffect(() => authClient.useSession.subscribe((value) => setSession(value)));
  return session;
}
