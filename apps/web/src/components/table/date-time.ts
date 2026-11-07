export type DateTimeInput = Date | string | number | null | undefined;

export function dateTimeValue(value: DateTimeInput): number | undefined {
  if (value == null || value === "") return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
