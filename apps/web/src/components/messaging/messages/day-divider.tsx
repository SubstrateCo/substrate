import { formatDayLabel, type DateInput } from "@/lib/format/date";

/** A line with the day's name between messages from different days. */
export function DayDivider({ date }: { date: DateInput }) {
  const label = formatDayLabel(date);
  return (
    <div
      role="separator"
      aria-label={label}
      className="flex max-w-3xl items-center gap-3 px-4 pt-3 pb-1"
    >
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
