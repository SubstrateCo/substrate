import type { TaskStatus } from "@substrate/contracts/tasks";

export function isClosedTask(task: { status: TaskStatus }) {
  return task.status === "completed" || task.status === "canceled";
}

export const hiddenTask = "A task you can’t open";
export const hiddenTaskInline = "a task you can’t open";
