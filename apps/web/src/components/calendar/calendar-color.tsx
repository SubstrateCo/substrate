import { cn } from "cn";

/** A calendar's color as a small dot beside its name. The name always carries the meaning. */
export function CalendarColorDot({
  color,
  className,
}: {
  color: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ "--calendar-color": color ?? "var(--primary)" }}
      className={cn("size-2.5 shrink-0 rounded-full bg-(--calendar-color)", className)}
    />
  );
}
