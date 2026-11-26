import type { BridgeAPI } from "./ipc.ts";
import { meetingReminderSettings } from "./screen-notifications-ipc.ts";
import { shortcutSettings } from "./shortcuts.ts";
import { z } from "zod";

export const channel = "substrate:desktop-settings";
const settings = z.object({
  launchAtLogin: z.boolean(),
  meetingReminders: meetingReminderSettings,
});
export const methods = {
  get: { input: z.undefined(), output: settings },
  setLaunchAtLogin: { input: z.boolean(), output: settings },
  setMeetingReminders: { input: meetingReminderSettings, output: settings },
  getShortcuts: { input: z.undefined(), output: shortcutSettings },
  setShortcuts: { input: shortcutSettings, output: shortcutSettings },
};
export type DesktopSettingsAPI = BridgeAPI<typeof methods>;
