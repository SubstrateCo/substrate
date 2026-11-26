import type { MeetingReminderSettings } from "@substrate/contracts/desktop/screen-notifications-ipc";
import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";
import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { toast } from "sonner";

export type DesktopUpdateCommand = "check" | "install" | "download";

const updateCommandKey = ["desktop", "updates", "command"] as const;

/**
 * Runs one update command through the bridge. The update notice and the settings row share the
 * key, so a command started in one shows as pending in the other.
 */
export function useDesktopUpdateCommand(bridge: DesktopUpdatesAPI) {
  const pending = useIsMutating({ mutationKey: updateCommandKey, exact: true }) > 0;
  const command = useMutation({
    mutationKey: updateCommandKey,
    mutationFn: (kind: DesktopUpdateCommand): Promise<DesktopUpdateStatus | void> => {
      if (kind === "install") return bridge.installNow();
      if (kind === "download") return bridge.openDownloadPage();
      return bridge.checkForUpdates();
    },
    onError: () => toast.error("We couldn’t finish the update. Try again."),
  });
  return { pending, run: command.mutate };
}

export function useDesktopSettingsUpdate(bridge: DesktopSettingsAPI) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => bridge.setLaunchAtLogin(enabled),
    onSuccess: (next) => client.setQueryData(queryKeys.desktopSettings, next),
  });
}

export function useMeetingRemindersUpdate(bridge: DesktopSettingsAPI) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: MeetingReminderSettings) => bridge.setMeetingReminders(settings),
    onSuccess: (next) => client.setQueryData(queryKeys.desktopSettings, next),
  });
}
