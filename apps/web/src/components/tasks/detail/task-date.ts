export const dateOnly = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function parseTaskDate(input: string, now = new Date()): string | undefined {
  const text = input.trim().toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (text === "today") return dateOnly(today);
  if (text === "tomorrow") {
    today.setDate(today.getDate() + 1);
    return dateOnly(today);
  }
  const weekday = weekdays.findIndex((day) => text.length >= 3 && day.startsWith(text));
  if (weekday >= 0) {
    today.setDate(today.getDate() + ((weekday - today.getDay() + 7) % 7 || 7));
    return dateOnly(today);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const named = /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(text);
  const month = named
    ? months.findIndex((name) => named[1].length >= 3 && name.startsWith(named[1]))
    : -1;
  if (!iso && month < 0) return undefined;
  let year = today.getFullYear();
  if (iso) year = Number(iso[1]);
  else if (named?.[3]) year = Number(named[3]);
  const m = iso ? Number(iso[2]) - 1 : month;
  const day = Number(iso ? iso[3] : named?.[2]);
  if (
    !iso &&
    !named?.[3] &&
    (m < today.getMonth() || (m === today.getMonth() && day < today.getDate()))
  )
    year++;
  const date = new Date(year, m, day);
  return date.getFullYear() === year && date.getMonth() === m && date.getDate() === day
    ? dateOnly(date)
    : undefined;
}
