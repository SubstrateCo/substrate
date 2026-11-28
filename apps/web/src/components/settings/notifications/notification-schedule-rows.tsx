import type { NotificationSchedule } from "@substrate/contracts/notifications/preferences";

import { SettingSelect } from "./setting-select";
import { timeOptions, weekdayNames } from "@/components/agent-work/routines/schedule";
import { SettingsRow } from "@/components/layout/settings-section";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatTimeZone } from "@/lib/format/date";

const pad = (value: number) => String(value).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const minutes = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** Times of day for one end of the window. The other end's time is left out: they must differ. */
const windowOptions = (current: number, other: number) =>
  timeOptions(clock(current)).filter((option) => option.value !== clock(other));

/** The schedule switch, then its days and hours while it is on. */
export function NotificationScheduleRows({
  schedule,
  disabled,
  onEnable,
  onChange,
  onDisable,
}: {
  schedule: NotificationSchedule | null;
  disabled: boolean;
  onEnable: () => void;
  /** Saves the schedule with this change, in the device's time zone. */
  onChange: (change: Partial<Omit<NotificationSchedule, "timeZone">>) => void;
  onDisable: () => void;
}) {
  return (
    <>
      <SettingsRow
        label="Schedule"
        htmlFor="notification-schedule"
        description={
          schedule
            ? `You get alerts only on the chosen days and hours. Times use ${formatTimeZone(schedule.timeZone)}.`
            : "Get alerts only on the days and hours you choose."
        }
        control={
          <Switch
            id="notification-schedule"
            checked={schedule !== null}
            disabled={disabled}
            onCheckedChange={(checked) => (checked ? onEnable() : onDisable())}
          />
        }
      />
      {schedule && (
        <>
          <SettingsRow
            label="Days"
            control={
              <ToggleGroup
                type="multiple"
                variant="segmented"
                size="sm"
                spacing={0.5}
                aria-label="Days with alerts"
                value={schedule.days.map(String)}
                disabled={disabled}
                onValueChange={(values) => {
                  // A schedule needs at least one day. Turn the schedule off to allow none.
                  if (values.length) onChange({ days: values.map(Number).sort((a, b) => a - b) });
                }}
              >
                {weekdayNames.map((name, day) => (
                  <ToggleGroupItem key={name} value={String(day)} aria-label={name}>
                    {name.slice(0, 3)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          />
          <SettingsRow
            label="From"
            htmlFor="notification-schedule-start"
            control={
              <SettingSelect
                id="notification-schedule-start"
                value={clock(schedule.start)}
                options={windowOptions(schedule.start, schedule.end)}
                disabled={disabled}
                onChange={(value) => onChange({ start: minutes(value) })}
              />
            }
          />
          <SettingsRow
            label="To"
            htmlFor="notification-schedule-end"
            description={schedule.end < schedule.start ? "Ends the next day." : undefined}
            control={
              <SettingSelect
                id="notification-schedule-end"
                value={clock(schedule.end)}
                options={windowOptions(schedule.end, schedule.start)}
                disabled={disabled}
                onChange={(value) => onChange({ end: minutes(value) })}
              />
            }
          />
        </>
      )}
    </>
  );
}
