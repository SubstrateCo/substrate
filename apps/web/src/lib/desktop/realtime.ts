import type { RealtimeAPI } from "@startup-os/contracts/realtime";

declare global {
  interface Window {
    startupOSRealtime?: RealtimeAPI;
  }
}
