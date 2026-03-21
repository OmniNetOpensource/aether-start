import { createContext, useContext, useEffect, useState } from 'react';
import { BREAKPOINTS, type DeviceType } from '@/lib/responsive-types';

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

const ResponsiveContext = createContext<DeviceType>('desktop');

export function ResponsiveProvider({ children }: { children: React.ReactNode }) {
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop');

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_QUERY);
    const desktopQuery = window.matchMedia(DESKTOP_QUERY);

    const handler = () => setDeviceType(getSnapshot());

    mobileQuery.addEventListener('change', handler);
    tabletQuery.addEventListener('change', handler);
    desktopQuery.addEventListener('change', handler);

    return () => {
      mobileQuery.removeEventListener('change', handler);
      tabletQuery.removeEventListener('change', handler);
      desktopQuery.removeEventListener('change', handler);
    };
  }, []);

  return <ResponsiveContext.Provider value={deviceType}>{children}</ResponsiveContext.Provider>;
}

export function useResponsive() {
  return useContext(ResponsiveContext);
}
