import { dateTimeValue, type DateTimeInput } from "./date-time";
import { useCellContext } from "./table";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function DateTimeCell() {
  const cell = useCellContext<number | undefined>();
  return <DateTimeDisplay value={cell.getValue()} />;
}

export function DateTimeDisplay({ value }: { value: DateTimeInput }) {
  const timestamp = dateTimeValue(value);
  if (timestamp === undefined) return <span aria-label="No date">—</span>;
  const date = new Date(timestamp);
  return <time dateTime={date.toISOString()}>{formatter.format(date)} UTC</time>;
}
