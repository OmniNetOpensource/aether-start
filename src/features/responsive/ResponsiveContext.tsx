"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { BREAKPOINTS, type DeviceType } from "./types";

const MOBILE_QUERY = `(max-width: ${BREAKPOINTS.mobileMax}px)`;
const TABLET_QUERY = `(min-width: ${BREAKPOINTS.tabletMin}px) and (max-width: ${BREAKPOINTS.tabletMax}px)`;
const DESKTOP_QUERY = `(min-width: ${BREAKPOINTS.desktopMin}px)`;

const ResponsiveContext = createContext<DeviceType>("desktop");

export function ResponsiveProvider({
  children,
  initialDeviceType = "desktop",
}: {
  children: React.ReactNode;
  initialDeviceType?: DeviceType;
}) {
  const [deviceType, setDeviceType] = useState<DeviceType>(initialDeviceType);

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_QUERY);
    const desktopQuery = window.matchMedia(DESKTOP_QUERY);

    const getDeviceType = () => {
      if (mobileQuery.matches) {
        return "mobile";
      }
      if (tabletQuery.matches) {
        return "tablet";
      }
      if (desktopQuery.matches) {
        return "desktop";
      }
      return "desktop";
    };

    const update = () => {
      const next = getDeviceType();
      setDeviceType((current) => (current === next ? current : next));
    };

    const rafId = requestAnimationFrame(update);
    const handler = () => update();

    mobileQuery.addEventListener("change", handler);
    tabletQuery.addEventListener("change", handler);
    desktopQuery.addEventListener("change", handler);

    return () => {
      cancelAnimationFrame(rafId);
      mobileQuery.removeEventListener("change", handler);
      tabletQuery.removeEventListener("change", handler);
      desktopQuery.removeEventListener("change", handler);
    };
  }, []);

  return (
    <ResponsiveContext.Provider value={deviceType}>
      {children}
    </ResponsiveContext.Provider>
  );
}

export function useResponsive() {
  return useContext(ResponsiveContext);
}
