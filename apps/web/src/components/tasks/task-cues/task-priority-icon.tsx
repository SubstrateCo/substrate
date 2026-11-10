import type { Task } from "../types";
import { cn } from "cn";
import { SignalLow, SignalMedium, SignalHigh, Minus, CircleAlert } from "lucide-react";

export function TaskPriorityIcon({
  priority,
  className,
}: {
  priority: Task["priority"];
  className?: string;
}) {
  const Icon = {
    none: Minus,
    low: SignalLow,
    medium: SignalMedium,
    high: SignalHigh,
    urgent: CircleAlert,
  }[priority];
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        priority === "urgent" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    />
  );
}
