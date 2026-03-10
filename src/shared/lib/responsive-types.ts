export type DeviceType = "mobile" | "tablet" | "desktop";

export const BREAKPOINTS = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1023,
  desktopMin: 1024,
} as const;
