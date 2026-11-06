import { setupRenderer } from "@better-auth/electron/preload";

const origin = process.argv
  .find((value) => value.startsWith("--startup-os-origin="))
  ?.slice("--startup-os-origin=".length);
if (process.isMainFrame && window.location.origin === origin) setupRenderer();
