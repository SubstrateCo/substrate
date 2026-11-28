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

export function toDate(value: DateInput): Date | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function formatShortDate(value: DateInput, now: DateInput = Date.now()) {
  const date = toDate(value);
  if (!date) return "";
  const sameYear = date.getFullYear() === toDate(now)?.getFullYear();
  return (sameYear ? shortDate : shortDateWithYear).format(date);
}

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

export function formatTime(value: DateInput) {
  const date = toDate(value);
  return date ? plain(time.format(date)) : "";
}

export function formatDateTime(value: DateInput, now: DateInput = Date.now()) {
  const date = toDate(value);
  return date ? `${formatShortDate(date, now)}, ${plain(time.format(date))}` : "";
}

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

export function isSameDay(a: DateInput, b: DateInput) {
  const first = toDate(a);
  const second = toDate(b);
  return !!first && !!second && first.toDateString() === second.toDateString();
}
export function formatMailListDate(value: DateInput, today: DateInput = Date.now()) {
  return isSameDay(value, today) ? formatTime(value) : formatShortDate(value, today);
}

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

const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: "short" });
const hour = new Intl.DateTimeFormat(locale, { hour: "numeric" });
const monthYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });

export function formatWeekdayShort(value: DateInput) {
  const date = toDate(value);
  return date ? weekdayShort.format(date) : "";
}

export function formatHour(value: DateInput) {
  const date = toDate(value);
  return date ? plain(hour.format(date)) : "";
}

export function formatMonthYear(value: DateInput) {
  const date = toDate(value);
  return date ? monthYear.format(date) : "";
}

export function formatDateRange(start: DateInput, end: DateInput, now: DateInput = Date.now()) {
  const first = toDate(start);
  const last = toDate(end);
  if (!first || !last) return "";
  if (isSameDay(first, last)) return formatShortDate(first, now);
  const sameMonth =
    first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth();
  const tail = sameMonth ? String(last.getDate()) : formatShortDate(last, now);
  return `${formatShortDate(first, now)} – ${tail}`;
}

export function formatTimeRange(start: DateInput, end: DateInput) {
  const from = formatTime(start);
  const until = formatTime(end);
  return from && until ? `${from} – ${until}` : from;
}

const localZone = new Intl.DateTimeFormat();

export function localTimeZone() {
  return localZone.resolvedOptions().timeZone;
}

export function parseDateOnly(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type DueDateState = "overdue" | "today" | "tomorrow" | "upcoming";

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
