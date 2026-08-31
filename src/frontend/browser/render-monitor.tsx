/**
 * Dev-only render monitor: logs component mount/rerender and triggers
 * golden-box flash on the component's root DOM element.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

const FLASH_DURATION_MS = 700;
const FLASH_CLASS = 'render-monitor-flash';

let instanceCounter = 0;

function getInstanceId(): number {
  instanceCounter += 1;
  return instanceCounter;
}

declare global {
  interface Window {
    __RENDER_MONITOR__?: {
      enabled: boolean;
      logEnabled: boolean;
      flashDurationMs: number;
      setEnabled: (v: boolean) => void;
      setLogEnabled: (v: boolean) => void;
    };
  }
}

export function useRenderMonitor(componentName: string): void {
  // Kept for optional manual use; Babel plugin uses RenderMonitorBoundary only
  void componentName;
}

interface RenderMonitorBoundaryProps {
  name: string;
  children: ReactNode;
}

export function RenderMonitorBoundary({ name, children }: RenderMonitorBoundaryProps) {
  const element = useRef<HTMLDivElement>(null);
  const instanceId = useRef<number | null>(null);
  const renderCount = useRef(0);
  const mountTime = useRef(0);
  const lastCommit = useRef<symbol | null>(null);
  const commit = Symbol();

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;

    const config = window.__RENDER_MONITOR__;
    if (config && !config.enabled) return;
    if (!element.current) return;

    if (instanceId.current === null) {
      instanceId.current = getInstanceId();
    }
    if (lastCommit.current !== commit) {
      lastCommit.current = commit;
      renderCount.current += 1;
      const phase = renderCount.current === 1 ? 'mount' : 'update';

      const now = performance.now();
      const elapsed = mountTime.current > 0 ? now - mountTime.current : 0;
      if (phase === 'mount') {
        mountTime.current = now;
      }

      if (config?.logEnabled !== false) {
        console.log(
          `[render-monitor] ${phase} ${name}#${instanceId.current} (render #${renderCount.current}${elapsed > 0 ? `, +${elapsed.toFixed(1)}ms` : ''})`,
        );
      }
    }

    const currentElement = element.current;
    currentElement.classList.add(FLASH_CLASS);
    const timer = setTimeout(
      () => currentElement.classList.remove(FLASH_CLASS),
      config?.flashDurationMs ?? FLASH_DURATION_MS,
    );
    return () => clearTimeout(timer);
  });

  if (!import.meta.env.DEV) return <>{children}</>;

  return (
    <div
      ref={element}
      style={{ display: 'inline-block', position: 'relative', minWidth: 0, minHeight: 0 }}
    >
      {children}
    </div>
  );
}

export function RenderMonitorController() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let enabled = true;
    let logEnabled = true;
    let flashDurationMs = FLASH_DURATION_MS;

    window.__RENDER_MONITOR__ = {
      get enabled() {
        return enabled;
      },
      set enabled(value) {
        enabled = value;
      },
      get logEnabled() {
        return logEnabled;
      },
      set logEnabled(value) {
        logEnabled = value;
      },
      get flashDurationMs() {
        return flashDurationMs;
      },
      set flashDurationMs(value) {
        flashDurationMs = value;
      },
      setEnabled: (value: boolean) => {
        enabled = value;
      },
      setLogEnabled: (value: boolean) => {
        logEnabled = value;
      },
    };
    return () => {
      delete window.__RENDER_MONITOR__;
    };
  }, []);
  return null;
}
