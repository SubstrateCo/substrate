import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  formatDateTime,
  formatFullTimestamp,
  formatRelativeTime,
  formatShortDate,
  formatTime,
  toDate,
  type DateInput,
} from "@/lib/format/date";
import { cn } from "cn";

const formats = {
  relative: formatRelativeTime,
  time: formatTime,
  date: formatShortDate,
  datetime: formatDateTime,
};

/**
 * A point in time. Lists use "relative" ("5m", then "Nov 8"); messages use "time". The full
 * timestamp is always in the tooltip.
 */
export function Timestamp({
  value,
  format = "relative",
  className,
}: {
  value: DateInput;
  format?: keyof typeof formats;
  className?: string;
}) {
  const date = toDate(value);
  if (!date) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={date.toISOString()}
          className={cn("whitespace-nowrap tabular-nums", className)}
        >
          {formats[format](date)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatFullTimestamp(date)}</TooltipContent>
    </Tooltip>
  );
}
