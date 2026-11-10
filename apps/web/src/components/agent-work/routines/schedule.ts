// Turns the common routine schedules into cron and back, and describes any schedule in words.
// Anything the builder can't express stays a custom cron expression.

export type Frequency = "daily" | "weekdays" | "weekly" | "custom";

export type Schedule = {
  frequency: Frequency;
  /** "HH:MM", 24-hour. */
  time: string;
  /** 0 is Sunday, as in cron. */
  weekday: number;
  cron: string;
};

export const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const pad = (value: number) => String(value).padStart(2, "0");

const fieldNumber = (field: string, max: number) =>
  /^\d{1,2}$/.test(field) && Number(field) <= max ? Number(field) : undefined;

/** Reads a cron expression into the builder, or "custom" when the builder can't show it. */
export function parseSchedule(cron: string): Schedule {
  const fields = cron.trim().split(/\s+/);
  const custom: Schedule = { frequency: "custom", time: "09:00", weekday: 1, cron: cron.trim() };
  if (fields.length !== 5) return custom;
  const [minuteField = "", hourField = "", dayOfMonth = "", month = "", dayOfWeek = ""] = fields;
  const minute = fieldNumber(minuteField, 59);
  const hour = fieldNumber(hourField, 23);
  const atFixedTime = minute !== undefined && hour !== undefined;
  const everyMonthDay = dayOfMonth === "*" && month === "*";
  if (!atFixedTime || !everyMonthDay) return custom;
  const time = `${pad(hour)}:${pad(minute)}`;
  const base = { ...custom, time };
  if (dayOfWeek === "*") return { ...base, frequency: "daily" };
  if (dayOfWeek === "1-5") return { ...base, frequency: "weekdays" };
  const weekday = /^[0-7]$/.test(dayOfWeek) ? Number(dayOfWeek) % 7 : undefined;
  if (weekday !== undefined) return { ...base, frequency: "weekly", weekday };
  return custom;
}

/** The cron expression for a schedule. Custom schedules keep the cron the owner typed. */
export function scheduleCron(schedule: Schedule) {
  if (schedule.frequency === "custom") return schedule.cron.trim();
  const [hour = "9", minute = "0"] = schedule.time.split(":");
  const time = `${Number(minute)} ${Number(hour)}`;
  if (schedule.frequency === "daily") return `${time} * * *`;
  if (schedule.frequency === "weekdays") return `${time} * * 1-5`;
  return `${time} * * ${schedule.weekday}`;
}

/** "9:00 AM" for "09:00". Uses a fixed date so time zones can't shift it. */
export function formatClock(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${pad(minute)} ${suffix}`;
}

/**
 * Every quarter hour of a day, as "HH:MM" values with their labels. A time that is off the grid,
 * such as one read from a saved cron, is kept so the picker can still show it.
 */
export function timeOptions(current: string) {
  const times = Array.from({ length: 96 }, (_, index) => {
    const minutes = index * 15;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  });
  const all = times.includes(current) ? times : [...times, current].sort();
  return all.map((value) => ({ value, label: formatClock(value) }));
}

/** A schedule in words: "Every weekday at 9:00 AM", or the cron for custom schedules. */
export function describeSchedule(cron: string) {
  const schedule = parseSchedule(cron);
  const at = formatClock(schedule.time);
  switch (schedule.frequency) {
    case "daily":
      return `Every day at ${at}`;
    case "weekdays":
      return `Every weekday at ${at}`;
    case "weekly":
      return `Every ${weekdayNames[schedule.weekday]} at ${at}`;
    case "custom":
      return `Custom schedule (${schedule.cron})`;
  }
}

/** Every IANA time zone this runtime knows, with the given zone first if it is missing. */
export function timeZones(current: string) {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}
