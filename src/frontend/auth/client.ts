import { createSignal, onSettled } from 'solid-js';
import { createAuthClient } from 'better-auth/client';
import { emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export function useAuthSession() {
  const [session, setSession] = createSignal(authClient.useSession.get());
  onSettled(() => authClient.useSession.subscribe((value) => setSession(value)));
  return session;
}
