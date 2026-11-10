import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { formatDueDate } from "@/lib/format/date";
import { cn } from "cn";

/** A task due date: "Today", "Tomorrow", or "Nov 4". Late dates are red and say so. */
export function DueDate({
  value,
  empty = "No due date",
  className,
}: {
  value: string | null;
  empty?: string;
  className?: string;
}) {
  const due = value ? formatDueDate(value) : undefined;
  if (!value || !due)
    return <span className={cn("text-muted-foreground", className)}>{empty}</span>;
  const overdue = due.state === "overdue";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={value}
          className={cn(
            "whitespace-nowrap tabular-nums",
            overdue && "font-medium text-destructive",
            className,
          )}
        >
          {due.label}
          {overdue && <span className="sr-only">, overdue</span>}
        </time>
      </TooltipTrigger>
      <TooltipContent>{overdue ? `Overdue · ${due.full}` : `Due ${due.full}`}</TooltipContent>
    </Tooltip>
  );
}
