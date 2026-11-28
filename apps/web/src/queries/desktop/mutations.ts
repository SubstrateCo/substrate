import type { MeetingReminderSettings } from "@substrate/contracts/desktop/screen-notifications-ipc";
import type { ShortcutSettings } from "@substrate/contracts/desktop/shortcuts";
import type {
  DesktopUpdatesAPI,
  DesktopUpdateStatus,
} from "@substrate/contracts/desktop/updates-ipc";
import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { confirmDiscardDrafts } from "@/lib/navigation/unsaved-drafts";
import { toast } from "sonner";

export type DesktopUpdateCommand = "check" | "install" | "download";

const updateCommandKey = ["desktop", "updates", "command"] as const;

export function useDesktopUpdateCommand(bridge: DesktopUpdatesAPI) {
  const pending = useIsMutating({ mutationKey: updateCommandKey, exact: true }) > 0;
  const command = useMutation({
    mutationKey: updateCommandKey,
    mutationFn: async (kind: DesktopUpdateCommand): Promise<DesktopUpdateStatus | void> => {
      if (kind === "install") {
        if (!(await confirmDiscardDrafts())) return;
        return bridge.installNow();
      }
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

export function useShortcutsUpdate(bridge: DesktopSettingsAPI | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (shortcuts: ShortcutSettings) => {
      if (!bridge) throw new Error("Shortcuts are saved only in the desktop app.");
      return bridge.setShortcuts(shortcuts);
    },
    onSuccess: (next) => client.setQueryData(queryKeys.desktopShortcuts, next),
  });
}

export function useMeetingRemindersUpdate(bridge: DesktopSettingsAPI) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: MeetingReminderSettings) => bridge.setMeetingReminders(settings),
    onSuccess: (next) => client.setQueryData(queryKeys.desktopSettings, next),
  });
}
