import type { BridgeAPI } from "./ipc.ts";
import { z } from "zod";

export const channel = "substrate:desktop-updates";
/** Main sends every status change on this channel. */
export const statusChannel = "substrate:desktop-updates:status";

const version = z.string().min(1);
export const updateStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }),
  z.object({ status: z.literal("checking") }),
  /** The last check found no newer version. */
  z.object({ status: z.literal("current") }),
  /** A newer version exists. Manual installations download it from the release page. */
  z.object({ status: z.literal("available"), version }),
  z.object({ status: z.literal("downloading"), version, percent: z.number().min(0).max(100) }),
  /** Downloaded and installs when the app restarts. */
  z.object({ status: z.literal("ready"), version }),
  /** Background work is stopping before the installer restarts the app. */
  z.object({ status: z.literal("installing"), version }),
  z.object({ status: z.literal("error") }),
]);
export type DesktopUpdateState = z.infer<typeof updateStateSchema>;

export const updateStatusSchema = z.object({
  /** The running app's version. */
  appVersion: version,
  /**
   * How this installation applies updates. `automatic` downloads and installs (Windows).
   * `manual` only checks and opens the release page (unsigned macOS). `unavailable` never checks
   * (development builds and other platforms).
   */
  install: z.enum(["automatic", "manual", "unavailable"]),
  state: updateStateSchema,
});
export type DesktopUpdateStatus = z.infer<typeof updateStatusSchema>;

export const methods = {
  get: { input: z.undefined(), output: updateStatusSchema },
  checkForUpdates: { input: z.undefined(), output: updateStatusSchema },
  /** Restart now and install a downloaded update. Only for `automatic` installations. */
  installNow: { input: z.undefined() },
  /** Open the release page of the available version. Only for `manual` installations. */
  openDownloadPage: { input: z.undefined() },
};

export type DesktopUpdatesAPI = BridgeAPI<typeof methods> & {
  onChange(callback: (status: DesktopUpdateStatus) => void): () => void;
};
