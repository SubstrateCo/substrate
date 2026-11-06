import type { ExposedBridges, ElectronClientOptions } from "@better-auth/electron/client";

declare global {
  interface Window extends Partial<ExposedBridges<ElectronClientOptions>> {}
}

export const isDesktop = () => Boolean(window.requestAuth);
