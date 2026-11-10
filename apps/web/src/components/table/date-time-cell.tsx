import { Timestamp } from "../time/timestamp";
import { dateTimeValue, type DateTimeInput } from "./date-time";
import { useCellContext } from "./table";

export function DateTimeCell() {
  const cell = useCellContext<number | undefined>();
  return <DateTimeDisplay value={cell.getValue()} />;
}

export function DateTimeDisplay({ value }: { value: DateTimeInput }) {
  const timestamp = dateTimeValue(value);
  if (timestamp === undefined)
    return (
      <span aria-label="No date" className="text-muted-foreground">
        —
      </span>
    );
  return <Timestamp value={timestamp} format="datetime" />;
}
