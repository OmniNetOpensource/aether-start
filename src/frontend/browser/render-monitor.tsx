/**
 * Dev-only render monitor: logs component mount/rerender and triggers
 * golden-box flash on the component's root DOM element.
 */

import { onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useMountEffect } from '@/frontend/app-shell/useMountEffect';

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
  children: JSX.Element;
}

export function RenderMonitorBoundary(props: RenderMonitorBoundaryProps) {
  let element: HTMLDivElement | undefined;
  let instanceId: number | undefined;

  onSettled(() => {
    if (!import.meta.env.DEV) return;
    const cfg = window.__RENDER_MONITOR__;
    if (cfg && !cfg.enabled) return;

    if (!element) return;

    instanceId = getInstanceId();

    const logEnabled = cfg?.logEnabled !== false;
    if (logEnabled) {
      console.log(`[render-monitor] mount ${props.name}#${instanceId} (render #1)`);
    }

    const duration = cfg?.flashDurationMs ?? FLASH_DURATION_MS;
    element.classList.add(FLASH_CLASS);
    const t = setTimeout(() => {
      element?.classList.remove(FLASH_CLASS);
    }, duration);
    return () => clearTimeout(t);
  });

  if (!import.meta.env.DEV) {
    return <>{props.children}</>;
  }

  return (
    <div
      ref={(current) => {
        element = current;
      }}
      style={{ display: 'inline-block', position: 'relative', 'min-width': 0, 'min-height': 0 }}
    >
      {props.children}
    </div>
  );
}

export function RenderMonitorController() {
  useMountEffect(() => {
    if (!import.meta.env.DEV) return;

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
