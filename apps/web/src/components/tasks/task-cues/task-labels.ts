import type { TaskPriority } from "@startup-os/contracts/tasks";

export const taskPriorityLabels: Record<TaskPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/** Most urgent first. Menus and priority sorting use this order. */
export const taskPriorityOrder: readonly TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];
