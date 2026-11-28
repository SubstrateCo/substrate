import type { TaskPriority } from "@substrate/contracts/tasks";

export const taskPriorityLabels: Record<TaskPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const taskPriorityOrder: readonly TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];
