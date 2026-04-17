import type { DevtoolsOptions } from 'zustand/middleware';

export const zustandDevtoolsEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_ZUSTAND_DEVTOOLS === 'true';

/** Only ChatRequestStore (`setStatus`) is wired into devtools for now. */
const zustandDevtoolsCaptureStoreName = 'ChatRequestStore';

export const getZustandDevtoolsOptions = (name: string): DevtoolsOptions => ({
  name,
  enabled: zustandDevtoolsEnabled && name === zustandDevtoolsCaptureStoreName,
});
