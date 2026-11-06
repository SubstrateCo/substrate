import { useCellContext } from "./table";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function DateTimeCell() {
  const cell = useCellContext<number | undefined>();
  const value = cell.getValue();
  if (value === undefined) return <span aria-label="No date">—</span>;
  const date = new Date(value);
  return <time dateTime={date.toISOString()}>{formatter.format(date)} UTC</time>;
}
