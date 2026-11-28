import type { Task } from "../types";
import { cn } from "cn";
import { CircleAlert } from "lucide-react";

const levels = { none: 0, low: 1, medium: 2, high: 3 } as const;
const bars = [
  { x: 2.5, y: 9.5, height: 4 },
  { x: 7, y: 6.5, height: 7 },
  { x: 11.5, y: 3.5, height: 10 },
];

export function TaskPriorityIcon({
  priority,
  className,
}: {
  priority: Task["priority"];
  className?: string;
}) {
  if (priority === "urgent")
    return (
      <CircleAlert
        aria-hidden="true"
        className={cn("size-4 shrink-0 text-destructive", className)}
      />
    );
  const level = levels[priority];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      fill="currentColor"
    >
      {bars.map((bar, index) => (
        <rect key={bar.x} {...bar} width={2} rx={0.75} opacity={index < level ? 1 : 0.28} />
      ))}
    </svg>
  );
}
