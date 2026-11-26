import {
  formatDateTime,
  formatFullTimestamp,
  formatTime,
  isSameDay,
  toDate,
  type DateInput,
} from "@/lib/format/date";

export function activityTime(value: string, now: DateInput = Date.now()) {
  const date = toDate(value);
  if (!date) return undefined;
  const iso = date.toISOString();
  return {
    iso,
    label: isSameDay(date, now) ? formatTime(date) : formatDateTime(date, now),
    full: `${formatFullTimestamp(date)} (${iso})`,
  };
}
