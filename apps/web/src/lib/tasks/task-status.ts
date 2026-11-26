import type { TaskStatus } from "@substrate/contracts/tasks";

/** A completed or canceled task. It never blocks, and lists show it dimmed. */
export function isClosedTask(task: { status: TaskStatus }) {
  return task.status === "completed" || task.status === "canceled";
}

/** Stands in for the name of a task the viewer can't open. */
export const hiddenTask = "A task you can’t open";
/** The same placeholder inside a sentence, as in "Subtask of a task you can’t open". */
export const hiddenTaskInline = "a task you can’t open";
