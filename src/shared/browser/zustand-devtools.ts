import type { DevtoolsOptions } from 'zustand/middleware';

export const zustandDevtoolsEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_ZUSTAND_DEVTOOLS === 'true';

export const getZustandDevtoolsOptions = (name: string): DevtoolsOptions => ({
  name,
  enabled: zustandDevtoolsEnabled,
});
