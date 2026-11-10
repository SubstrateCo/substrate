// The one place that turns dates into display text. Views use these helpers, or the
// components in `components/time`, instead of calling toLocaleString or Intl directly.

export type DateInput = Date | string | number;

const locale = "en-US";
const day = 86_400_000;
const units: [string, number][] = [
  ["d", day],
  ["h", 3_600_000],
  ["m", 60_000],
];

const shortDate = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
const shortDateWithYear = new Intl.DateTimeFormat(locale, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
const fullTimestamp = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" });
const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });

// ICU puts a narrow no-break space before AM and PM. Plain spaces match the rest of the copy.
const plain = (text: string) => text.replace(/ /g, " ");

/** A Date for a timestamp, or undefined when the value is not a date. */
export function toDate(value: DateInput): Date | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** "Nov 8", or "Nov 8, 2025" outside the current year. */
export function formatShortDate(value: DateInput, now: DateInput = Date.now()) {
  const date = toDate(value);
  if (!date) return "";
  const sameYear = date.getFullYear() === toDate(now)?.getFullYear();
  return (sameYear ? shortDate : shortDateWithYear).format(date);
}

/** Compact time since an event: "now", "5m", "3h", "6d", then a short date. */
export function formatRelativeTime(value: DateInput, now: DateInput = Date.now()) {
  const date = toDate(value);
  if (!date) return "";
  const elapsed = (toDate(now)?.getTime() ?? Date.now()) - date.getTime();
  if (elapsed < 7 * day) {
    for (const [unit, size] of units)
      if (elapsed >= size) return `${Math.floor(elapsed / size)}${unit}`;
    return "now";
  }
  return formatShortDate(date, now);
}

/** Time of day: "3:40 PM". */
export function formatTime(value: DateInput) {
  const date = toDate(value);
  return date ? plain(time.format(date)) : "";
}

/** "Nov 8, 3:40 PM", with the year outside the current year. */
export function formatDateTime(value: DateInput, now: DateInput = Date.now()) {
  const date = toDate(value);
  return date ? `${formatShortDate(date, now)}, ${plain(time.format(date))}` : "";
}

/** "Nov 8, 3:40 PM" read in a named IANA time zone instead of the viewer's. */
export function formatDateTimeInZone(value: DateInput, zone: string, now: DateInput = Date.now()) {
  const date = toDate(value);
  if (!date) return "";
  try {
    const years = new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: zone });
    const sameYear = years.format(date) === years.format(toDate(now) ?? date);
    const dayText = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
      timeZone: zone,
    }).format(date);
    const clock = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }).format(date);
    return `${dayText}, ${plain(clock)}`;
  } catch {
    return formatDateTime(date, now);
  }
}

/** "Tue, Nov 10, 9:00 AM EST": a moment read in a named IANA time zone, with the zone's short name. */
export function formatZonedDateTime(value: DateInput, zone: string) {
  const date = toDate(value);
  if (!date) return "";
  try {
    return plain(
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: zone,
      }).format(date),
    ).replace(" at ", ", ");
  } catch {
    return formatDateTime(date);
  }
}

/** "America / New York · UTC−5": a zone's name for reading, with its offset at the given time. */
export function formatTimeZone(zone: string, at: DateInput = Date.now()) {
  const name = zone.replaceAll("_", " ").replaceAll("/", " / ");
  const date = toDate(at);
  if (!date) return name;
  try {
    const offset = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    if (!offset) return name;
    const zero = /^GMT([+-]0+(:00)?)?$/.test(offset);
    const label = zero ? "UTC" : offset.replace("GMT", "UTC").replace("-", "−");
    return name === label ? name : `${name} · ${label}`;
  } catch {
    return name;
  }
}

/** The unambiguous form for tooltips: "Sunday, November 8, 2026 at 3:40 PM". */
export function formatFullTimestamp(value: DateInput) {
  const date = toDate(value);
  return date ? plain(fullTimestamp.format(date)) : "";
}

const weekdayDate = new Intl.DateTimeFormat(locale, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const weekdayDateWithYear = new Intl.DateTimeFormat(locale, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** Whether two moments fall on the same local calendar day. */
export function isSameDay(a: DateInput, b: DateInput) {
  const first = toDate(a);
  const second = toDate(b);
  return !!first && !!second && first.toDateString() === second.toDateString();
}

/** A day divider: "Today", "Yesterday", "Monday, November 2", with the year outside this year. */
export function formatDayLabel(value: DateInput, now: DateInput = Date.now()) {
  const date = toDate(value);
  const today = toDate(now);
  if (!date || !today) return "";
  if (isSameDay(date, today)) return "Today";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return (date.getFullYear() === today.getFullYear() ? weekdayDate : weekdayDateWithYear).format(
    date,
  );
}

/** A calendar date stored as YYYY-MM-DD, read in local time so it never shifts a day. */
export function parseDateOnly(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) ? date : undefined;
}

type DueDateState = "overdue" | "today" | "tomorrow" | "upcoming";

/** A due date relative to today: "Today", "Tomorrow", or a short date, and whether it is late. */
export function formatDueDate(value: string, now: DateInput = Date.now()) {
  const date = parseDateOnly(value);
  const today = toDate(now);
  if (!date || !today) return undefined;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((date.getTime() - start.getTime()) / day);
  let state: DueDateState = "upcoming";
  if (days < 0) state = "overdue";
  else if (days === 0) state = "today";
  else if (days === 1) state = "tomorrow";
  const labels: Partial<Record<DueDateState, string>> = { today: "Today", tomorrow: "Tomorrow" };
  return {
    label: labels[state] ?? formatShortDate(date, now),
    state,
    full: fullDate.format(date),
  };
}
