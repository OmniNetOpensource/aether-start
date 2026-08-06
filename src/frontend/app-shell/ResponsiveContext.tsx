import { createContext, createSignal, onSettled, useContext, type Accessor } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { BREAKPOINTS, type DeviceType } from '@/frontend/app-shell/responsive-types';

const MOBILE_QUERY = `(max-width: ${BREAKPOINTS.mobileMax}px)`;
const TABLET_QUERY = `(min-width: ${BREAKPOINTS.tabletMin}px) and (max-width: ${BREAKPOINTS.tabletMax}px)`;
const DESKTOP_QUERY = `(min-width: ${BREAKPOINTS.desktopMin}px)`;

function getSnapshot(): DeviceType {
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const tabletQuery = window.matchMedia(TABLET_QUERY);
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);

  if (mobileQuery.matches) return 'mobile';
  if (tabletQuery.matches) return 'tablet';
  if (desktopQuery.matches) return 'desktop';
  return 'desktop';
}

const ResponsiveContext = createContext<Accessor<DeviceType>>(() => 'desktop');

function subscribe(onStoreChange: () => void) {
  const mobileQuery = window.matchMedia(MOBILE_QUERY);
  const tabletQuery = window.matchMedia(TABLET_QUERY);
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);

  mobileQuery.addEventListener('change', onStoreChange);
  tabletQuery.addEventListener('change', onStoreChange);
  desktopQuery.addEventListener('change', onStoreChange);

  return () => {
    mobileQuery.removeEventListener('change', onStoreChange);
    tabletQuery.removeEventListener('change', onStoreChange);
    desktopQuery.removeEventListener('change', onStoreChange);
  };
}

export function ResponsiveProvider(props: { children: JSX.Element }) {
  const [deviceType, setDeviceType] = createSignal<DeviceType>('desktop');
  onSettled(() => {
    setDeviceType(getSnapshot());
    return subscribe(() => setDeviceType(getSnapshot()));
  });

  return <ResponsiveContext value={deviceType}>{props.children}</ResponsiveContext>;
}

export function useResponsive() {
  return useContext(ResponsiveContext);
}
