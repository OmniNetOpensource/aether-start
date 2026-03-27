/**
 * Dev-only render monitor: logs component mount/rerender and triggers
 * golden-box flash on the component's root DOM element.
 */

import { useLayoutEffect, useRef } from 'react';
import { useMountEffect } from '@/shared/useMountEffect';

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
  children: React.ReactNode;
}

export function RenderMonitorBoundary({ name, children }: RenderMonitorBoundaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceIdRef = useRef<number | null>(null);
  const renderCountRef = useRef(0);
  const mountTimeRef = useRef<number>(0);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    const cfg = typeof window !== 'undefined' ? window.__RENDER_MONITOR__ : undefined;
    if (cfg && !cfg.enabled) return;

    const el = ref.current;
    if (!el) return;

    if (instanceIdRef.current === null) {
      instanceIdRef.current = getInstanceId();
    }
    renderCountRef.current += 1;
    const phase = renderCountRef.current === 1 ? 'mount' : 'update';

    const now = performance.now();
    const elapsed = mountTimeRef.current > 0 ? now - mountTimeRef.current : 0;
    if (phase === 'mount') {
      mountTimeRef.current = now;
    }

    const logEnabled = cfg?.logEnabled !== false;
    if (logEnabled) {
      console.log(
        `[render-monitor] ${phase} ${name}#${instanceIdRef.current} (render #${renderCountRef.current}${elapsed > 0 ? `, +${elapsed.toFixed(1)}ms` : ''})`,
      );
    }

    const duration = cfg?.flashDurationMs ?? FLASH_DURATION_MS;
    el.classList.add(FLASH_CLASS);
    const t = setTimeout(() => {
      el.classList.remove(FLASH_CLASS);
    }, duration);
    return () => clearTimeout(t);
  }, [name]);

  if (!import.meta.env.DEV) {
    return <>{children}</>;
  }

  return (
    <div
      ref={ref}
      style={{ display: 'inline-block', position: 'relative', minWidth: 0, minHeight: 0 }}
    >
      {children}
    </div>
  );
}

export function RenderMonitorController() {
  useMountEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;

    let enabled = true;
    let logEnabled = true;
    let flashDurationMs = FLASH_DURATION_MS;

    window.__RENDER_MONITOR__ = {
      get enabled() {
        return enabled;
      },
      set enabled(v) {
        enabled = v;
      },
      get logEnabled() {
        return logEnabled;
      },
      set logEnabled(v) {
        logEnabled = v;
      },
      get flashDurationMs() {
        return flashDurationMs;
      },
      set flashDurationMs(v) {
        flashDurationMs = v;
      },
      setEnabled: (v: boolean) => {
        enabled = v;
      },
      setLogEnabled: (v: boolean) => {
        logEnabled = v;
      },
    };
    return () => {
      delete window.__RENDER_MONITOR__;
    };
  });
  return null;
}
