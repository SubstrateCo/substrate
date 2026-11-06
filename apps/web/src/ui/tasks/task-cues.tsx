import type { Task } from "./types";
import {
  Eye,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Minus,
  AlertCircle,
} from "lucide-react";

export function TaskStatusIcon({ status }: { status: Task["status"] }) {
  const Icon = {
    not_started: CircleDashed,
    in_progress: CircleDot,
    in_review: Eye,
    completed: CircleCheck,
    canceled: CircleX,
  }[status];
  const color = {
    not_started: "text-muted-foreground",
    in_progress: "text-primary",
    in_review: "text-foreground",
    completed: "text-success",
    canceled: "text-muted-foreground",
  }[status];
  return <Icon aria-hidden="true" className={`size-4 shrink-0 ${color}`} />;
}

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
