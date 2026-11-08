export const taskStatusValues = [
  "not_started",
  "in_progress",
  "in_review",
  "completed",
  "canceled",
] as const;

export type TaskStatus = (typeof taskStatusValues)[number];

export const taskPriorityValues = ["none", "low", "medium", "high", "urgent"] as const;

export const taskStatusLabels: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  in_review: "In Review",
  completed: "Completed",
  canceled: "Canceled",
};
