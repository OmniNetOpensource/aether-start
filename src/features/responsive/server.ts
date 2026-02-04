import type { DeviceType } from "./types";

const TABLET_UA_PATTERN = /iPad|Tablet|PlayBook|Silk/i;
const ANDROID_TABLET_PATTERN = /Android(?!.*Mobile)/i;
const MOBILE_UA_PATTERN = /Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function detectDeviceTypeFromUA(userAgent: string): DeviceType {
  const ua = userAgent || "";

  if (!ua) {
    return "desktop";
  }

  if (TABLET_UA_PATTERN.test(ua) || ANDROID_TABLET_PATTERN.test(ua)) {
    return "tablet";
  }

  if (MOBILE_UA_PATTERN.test(ua)) {
    return "mobile";
  }

  return "desktop";
}
