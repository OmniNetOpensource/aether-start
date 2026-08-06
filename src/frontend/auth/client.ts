import { createSignal } from 'solid-js';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { useMountEffect } from '@/frontend/app-shell/useMountEffect';

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [emailOTPClient()],
});

export function useAuthSession() {
  const [session, setSession] = createSignal(authClient.useSession.get());
  useMountEffect(() => authClient.useSession.subscribe((value) => setSession(value)));
  return session;
}
