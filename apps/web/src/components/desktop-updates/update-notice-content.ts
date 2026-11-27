import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";

export type UpdateNoticeAction = "install" | "download" | "retry";

export interface UpdateNoticeContent {
  /** Changes when the notice means something new, so a dismissed notice can come back. */
  key: string;
  tone: "default" | "error";
  title: string;
  description: string;
  action?: { kind: UpdateNoticeAction; label: string };
}

/** The notice for an update that needs the person, or undefined when there is nothing to say. */
export function updateNoticeContent(status: DesktopUpdateStatus): UpdateNoticeContent | undefined {
  const { install, state } = status;
  if (install === "unavailable") return undefined;
  switch (state.status) {
    case "available":
      // Automatic installations download at once and show the download instead.
      if (install !== "manual") return undefined;
      return {
        key: `available:${state.version}`,
        tone: "default",
        title: `Substrate ${state.version} is available`,
        description: "Download the new version and replace the app in Applications.",
        action: { kind: "download", label: "Download" },
      };
    case "downloading":
      return {
        key: `downloading:${state.version}`,
        tone: "default",
        title: `Downloading Substrate ${state.version}`,
        description: `${Math.floor(state.percent)}% done. You can keep working.`,
      };
    case "ready":
      return {
        key: `ready:${state.version}`,
        tone: "default",
        title: "Update ready",
        description: `Restart Substrate to update to version ${state.version}.`,
        action: { kind: "install", label: "Restart to update" },
      };
    case "error":
      return {
        key: "error",
        tone: "error",
        title: "Couldn’t update Substrate",
        description: "Check your connection, then try again.",
        action: { kind: "retry", label: "Try again" },
      };
    case "idle":
    case "checking":
    case "current":
    case "installing":
      return undefined;
  }
}
