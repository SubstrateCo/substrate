import type { Task } from "../types";
import { Eye, CircleCheck, CircleDashed, CircleDot, CircleX } from "lucide-react";

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
