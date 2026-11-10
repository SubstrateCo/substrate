import type { TaskFields } from "./contracts";
import type { tasks } from "./tasks.schema";

/**
 * The activity an update records, one entry per field whose value changes. "Assignee changed"
 * also sends the assignment notice.
 */
export function taskChanges(task: typeof tasks.$inferSelect, input: Partial<TaskFields>) {
  const changes: string[] = [];
  if (input.status !== undefined && input.status !== task.status) changes.push("Status changed");
  if (
    input.assigneeActorEntityId !== undefined &&
    input.assigneeActorEntityId !== task.assigneeActorEntityId
  )
    changes.push("Assignee changed");
  if (input.title !== undefined && input.title.trim() !== task.title) changes.push("Title changed");
  if (input.description !== undefined && input.description !== task.description)
    changes.push("Description changed");
  if (input.priority !== undefined && input.priority !== task.priority)
    changes.push("Priority changed");
  if (input.dueDate !== undefined && input.dueDate !== task.dueDate)
    changes.push("Due date changed");
  return changes;
}
