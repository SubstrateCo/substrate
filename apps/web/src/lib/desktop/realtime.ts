import type { RealtimeAPI } from "@substrate/contracts/realtime";

declare global {
  interface Window {
    substrateRealtime?: RealtimeAPI;
  }
}
