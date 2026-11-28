import type {
  AccountNotificationPreferences,
  NotificationFlashMode,
  NotificationLevel,
  NotificationPreview,
  NotificationSchedule,
  WorkspaceNotificationPreferences,
} from "@substrate/contracts/notifications/preferences";
import { notificationLevels } from "@substrate/contracts/notifications/preferences";

import { NotificationScheduleRows } from "./notification-schedule-rows";
import { MuteSelect, SettingSelect } from "./setting-select";
import { SettingsRow, SettingsSection } from "@/components/layout/settings-section";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format/date";
import { levelLabels, muteState, muteUntil, type MuteChoice } from "@/lib/notifications/mute";

type AccountChange = Partial<AccountNotificationPreferences>;

const pauseChoices = [
  "off",
  "30m",
  "1h",
  "8h",
  "tomorrow",
  "forever",
] as const satisfies readonly MuteChoice[];
const workspaceMuteChoices = [
  "off",
  "1h",
  "8h",
  "24h",
  "forever",
] as const satisfies readonly MuteChoice[];

const previewOptions = [
  { value: "hidden", label: "Hidden" },
  { value: "sender", label: "Sender only" },
  { value: "full", label: "Full text" },
] as const satisfies readonly { value: NotificationPreview; label: string }[];
const previewDescriptions: Record<NotificationPreview, string> = {
  hidden: "Alerts show only what happened, such as “New message”. No names or text.",
  sender: "Alerts show who sent the message, but not the text.",
  full: "Alerts show the message text. The text then stays in your system’s notification history.",
};

const flashOptions = [
  { value: "idle", label: "When away" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
] as const satisfies readonly { value: NotificationFlashMode; label: string }[];

const levelOptions = notificationLevels.map((level) => ({
  value: level,
  label: levelLabels[level],
}));

function pauseDescription(pausedUntil: string | null) {
  const state = muteState(pausedUntil);
  if (state.kind === "forever") return "Alerts are paused until you turn them back on.";
  if (state.kind === "until") return `Alerts are paused until ${formatDateTime(state.until)}.`;
  return "Stop all alerts on every workspace for a time.";
}

/** Whether alerts show at all: on or off, paused, or limited to a schedule. */
export function AlertSettings({
  preferences,
  pending,
  onChange,
  onScheduleChange,
}: {
  preferences: AccountNotificationPreferences;
  pending: boolean;
  onChange: (change: AccountChange) => void;
  /** Saves the schedule with this change, or turns it on with default hours. */
  onScheduleChange: (change: Partial<Omit<NotificationSchedule, "timeZone">>) => void;
}) {
  const off = !preferences.alertsEnabled;
  return (
    <SettingsSection
      title="Alerts"
      description="Alerts are system notifications on this computer. Every item stays in your notification feed, even when alerts are off."
    >
      <div className="min-w-0 divide-y">
        <SettingsRow
          label="Show alerts"
          htmlFor="notification-alerts"
          description="Turn off to stop alerts on every workspace."
          control={
            <Switch
              id="notification-alerts"
              checked={preferences.alertsEnabled}
              disabled={pending}
              onCheckedChange={(alertsEnabled) => onChange({ alertsEnabled })}
            />
          }
        />
        <SettingsRow
          label="Pause alerts"
          htmlFor="notification-pause"
          description={pauseDescription(preferences.pausedUntil)}
          control={
            <MuteSelect
              id="notification-pause"
              state={muteState(preferences.pausedUntil)}
              choices={pauseChoices}
              disabled={pending || off}
              onChange={(choice) => onChange({ pausedUntil: muteUntil(choice) })}
            />
          }
        />
        <NotificationScheduleRows
          schedule={preferences.schedule}
          disabled={pending || off}
          onEnable={() => onScheduleChange({})}
          onChange={onScheduleChange}
          onDisable={() => onChange({ schedule: null })}
        />
      </div>
    </SettingsSection>
  );
}

/** How an alert looks and sounds. */
export function AlertAppearanceSettings({
  preferences,
  pending,
  onChange,
}: {
  preferences: AccountNotificationPreferences;
  pending: boolean;
  onChange: (change: AccountChange) => void;
}) {
  return (
    <SettingsSection title="Appearance">
      <div className="min-w-0 divide-y">
        <SettingsRow
          label="Preview"
          htmlFor="notification-preview"
          description={previewDescriptions[preferences.preview]}
          control={
            <SettingSelect
              id="notification-preview"
              value={preferences.preview}
              options={previewOptions}
              disabled={pending}
              onChange={(preview) => onChange({ preview })}
            />
          }
        />
        <SettingsRow
          label="Sound"
          htmlFor="notification-sound"
          description="Play your system’s notification sound."
          control={
            <Switch
              id="notification-sound"
              checked={preferences.sound}
              disabled={pending}
              onCheckedChange={(sound) => onChange({ sound })}
            />
          }
        />
        <SettingsRow
          label="Flash taskbar"
          htmlFor="notification-flash"
          description="Flash the taskbar or Dock icon when an alert arrives. When away flashes only after you stop using this computer."
          control={
            <SettingSelect
              id="notification-flash"
              value={preferences.flash}
              options={flashOptions}
              disabled={pending}
              onChange={(flash) => onChange({ flash })}
            />
          }
        />
      </div>
    </SettingsSection>
  );
}

/** The viewer's own settings in the active workspace. */
export function WorkspaceAlertSettings({
  preferences,
  pending,
  onChange,
}: {
  preferences: WorkspaceNotificationPreferences;
  pending: boolean;
  onChange: (
    change: Partial<{
      channels: NotificationLevel;
      assignments: boolean;
      mutedUntil: string | null;
    }>,
  ) => void;
}) {
  const mute = muteState(preferences.mutedUntil);
  return (
    <SettingsSection
      title="This workspace"
      description="These settings apply only to you, in this workspace."
    >
      <div className="min-w-0 divide-y">
        <SettingsRow
          label="Channels"
          htmlFor="notification-channels"
          description="The default for channels. DMs and groups use All. Change one conversation from its menu."
          control={
            <SettingSelect
              id="notification-channels"
              value={preferences.channels}
              options={levelOptions}
              disabled={pending}
              onChange={(channels) => onChange({ channels })}
            />
          }
        />
        <SettingsRow
          label="Task assignments"
          htmlFor="notification-assignments"
          description="Alert when someone assigns a task to you."
          control={
            <Switch
              id="notification-assignments"
              checked={preferences.assignments}
              disabled={pending}
              onCheckedChange={(assignments) => onChange({ assignments })}
            />
          }
        />
        <SettingsRow
          label="Mute workspace"
          htmlFor="notification-workspace-mute"
          description={
            mute.kind === "off"
              ? "Stop all alerts from this workspace, mentions too."
              : "All alerts from this workspace are off, mentions too."
          }
          control={
            <MuteSelect
              id="notification-workspace-mute"
              state={mute}
              choices={workspaceMuteChoices}
              disabled={pending}
              onChange={(choice) => onChange({ mutedUntil: muteUntil(choice) })}
            />
          }
        />
      </div>
    </SettingsSection>
  );
}
