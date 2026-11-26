import { mobileRouteFromUrl } from "@/lib/record-links";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return mobileRouteFromUrl(path, process.env.EXPO_PUBLIC_WEB_URL) ?? "/";
}
