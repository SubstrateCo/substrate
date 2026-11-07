import type { Task } from "../types";
import { SignalLow, SignalMedium, SignalHigh, Minus, AlertCircle } from "lucide-react";

export function TaskPriorityIcon({ priority }: { priority: Task["priority"] }) {
  const Icon = {
    none: Minus,
    low: SignalLow,
    medium: SignalMedium,
    high: SignalHigh,
    urgent: AlertCircle,
  }[priority];
  return (
    <Icon
      aria-hidden="true"
      className={`size-4 shrink-0 ${priority === "urgent" ? "text-destructive" : "text-muted-foreground"}`}
    />
  );
}
