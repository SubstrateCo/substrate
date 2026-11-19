export const taskStatusValues = [
  "not_started",
  "in_progress",
  "in_review",
  "completed",
  "canceled",
] as const;

export type TaskStatus = (typeof taskStatusValues)[number];

export const taskPriorityValues = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorityValues)[number];

/** Entity grant levels, weakest first. The database enum uses this order. */
export const permissionLevels = ["view", "comment", "edit", "owner"] as const;
export type PermissionLevel = (typeof permissionLevels)[number];

export const taskStatusLabels: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  in_review: "In review",
  completed: "Completed",
  canceled: "Canceled",
};
