import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";

export function updateRailLabel({ install, state }: DesktopUpdateStatus) {
  if (install === "unavailable") return undefined;
  switch (state.status) {
    case "available":
      return "Update available";
    case "downloading":
      return "Downloading update";
    case "ready":
      return "Update ready";
    case "idle":
    case "checking":
    case "current":
    case "error":
      return undefined;
  }
}
