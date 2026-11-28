import type {
  MeetingReminderSettings,
  reminderLeadMinutes,
} from "@substrate/contracts/desktop/screen-notifications-ipc";
import type { DesktopSettingsAPI } from "@substrate/contracts/desktop/window";

import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "@/components/feedback/error-state";
import { SettingsSection, SettingsRow } from "@/components/layout/settings-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { desktopSettingsBridge } from "@/lib/desktop/bridges";
import { useDesktopSettingsUpdate, useMeetingRemindersUpdate } from "@/queries/desktop/mutations";
import { desktopSettingsQueryOptions } from "@/queries/desktop/settings";
import { toast } from "sonner";

const settingError = () => toast.error("We couldn’t change this setting. Try again.");

const leadLabels: Record<(typeof reminderLeadMinutes)[number], string> = {
  0: "At start",
  1: "1 minute before",
  2: "2 minutes before",
  5: "5 minutes before",
  10: "10 minutes before",
};
const leadOptions = Object.entries(leadLabels).map(([value, label]) => ({ value, label }));
const isLead = (value: number): value is MeetingReminderSettings["leadMinutes"] =>
  Object.hasOwn(leadLabels, value);

const loading = <Skeleton role="status" aria-label="Loading" className="h-5 w-9" />;

export function DesktopPreferences() {
  const bridge = desktopSettingsBridge();
  if (!bridge) return null;
  return <DesktopPreferencesCard bridge={bridge} />;
}

function DesktopPreferencesCard({ bridge }: { bridge: DesktopSettingsAPI }) {
  const settings = useQuery(desktopSettingsQueryOptions(bridge));
  const update = useDesktopSettingsUpdate(bridge);
  return (
    <SettingsSection
      title="Desktop"
      description="Your agents run on this computer while Substrate is open."
    >
      {settings.isError ? (
        <ErrorState
          variant="compact"
          title="Couldn’t load desktop settings"
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <div className="min-w-0 divide-y">
          <SettingsRow
            label="Open at login"
            htmlFor="desktop-launch-at-login"
            description="Start hidden in the tray when you sign in to this computer, so agents keep running."
            control={
              settings.data ? (
                <Switch
                  id="desktop-launch-at-login"
                  checked={settings.data.launchAtLogin}
                  disabled={update.isPending}
                  onCheckedChange={(enabled) => update.mutate(enabled, { onError: settingError })}
                />
              ) : (
                loading
              )
            }
          />
          <MeetingReminderRows bridge={bridge} reminders={settings.data?.meetingReminders} />
        </div>
      )}
    </SettingsSection>
  );
}

function MeetingReminderRows({
  bridge,
  reminders,
}: {
  bridge: DesktopSettingsAPI;
  reminders: MeetingReminderSettings | undefined;
}) {
  const update = useMeetingRemindersUpdate(bridge);
  const save = (next: MeetingReminderSettings) => update.mutate(next, { onError: settingError });
  return (
    <>
      <SettingsRow
        label="Meeting reminders"
        htmlFor="desktop-meeting-reminders"
        description="Shows a card at the top-right of your screen, above other apps. Doesn’t follow Windows Focus or Do Not Disturb."
        control={
          reminders ? (
            <Switch
              id="desktop-meeting-reminders"
              checked={reminders.enabled}
              disabled={update.isPending}
              onCheckedChange={(enabled) => save({ ...reminders, enabled })}
            />
          ) : (
            loading
          )
        }
      />
      <SettingsRow
        label="Remind me"
        htmlFor="desktop-meeting-reminder-lead"
        control={
          reminders ? (
            <Select
              value={String(reminders.leadMinutes)}
              disabled={!reminders.enabled || update.isPending}
              onValueChange={(value) => {
                const leadMinutes = Number(value);
                if (isLead(leadMinutes)) save({ ...reminders, leadMinutes });
              }}
            >
              <SelectTrigger id="desktop-meeting-reminder-lead" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leadOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Skeleton role="status" aria-label="Loading" className="h-9 w-44" />
          )
        }
      />
    </>
  );
}
