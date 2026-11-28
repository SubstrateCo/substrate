export type Frequency = "daily" | "weekdays" | "weekly" | "custom";

export type Schedule = {
  frequency: Frequency;
  time: string;
  cronWeekday: number;
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

export function parseSchedule(cron: string): Schedule {
  const fields = cron.trim().split(/\s+/);
  const custom: Schedule = {
    frequency: "custom",
    time: "09:00",
    cronWeekday: 1,
    cron: cron.trim(),
  };
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
  const cronWeekday = /^[0-7]$/.test(dayOfWeek) ? Number(dayOfWeek) % 7 : undefined;
  if (cronWeekday !== undefined) return { ...base, frequency: "weekly", cronWeekday };
  return custom;
}

export function scheduleCron(schedule: Schedule) {
  if (schedule.frequency === "custom") return schedule.cron.trim();
  const [hour = "9", minute = "0"] = schedule.time.split(":");
  const time = `${Number(minute)} ${Number(hour)}`;
  if (schedule.frequency === "daily") return `${time} * * *`;
  if (schedule.frequency === "weekdays") return `${time} * * 1-5`;
  return `${time} * * ${schedule.cronWeekday}`;
}

export function formatClock(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${pad(minute)} ${suffix}`;
}

export function timeOptions(current: string) {
  const times = Array.from({ length: 96 }, (_, index) => {
    const minutes = index * 15;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  });
  const all = times.includes(current) ? times : [...times, current].sort();
  return all.map((value) => ({ value, label: formatClock(value) }));
}

export function describeSchedule(cron: string) {
  const schedule = parseSchedule(cron);
  const at = formatClock(schedule.time);
  switch (schedule.frequency) {
    case "daily":
      return `Every day at ${at}`;
    case "weekdays":
      return `Every weekday at ${at}`;
    case "weekly":
      return `Every ${weekdayNames[schedule.cronWeekday]} at ${at}`;
    case "custom":
      return `Custom schedule (${schedule.cron})`;
  }
}

export function timeZones(current: string) {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}
