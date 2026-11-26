const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const dayWithYear = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function messageTime(value: string | Date) {
  return time.format(new Date(value));
}

/** "Today", "Yesterday", or the date, for the divider above a day's first message. */
export function dayLabel(value: string | Date, now = new Date()) {
  const date = new Date(value);
  const startOf = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.getFullYear() === now.getFullYear() ? day.format(date) : dayWithYear.format(date);
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
