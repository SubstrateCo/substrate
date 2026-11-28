import { cn } from "cn";

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
