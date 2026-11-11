import type { TaskDraft } from "../types";

export function changedTaskFields(current: TaskDraft, draft: TaskDraft): Partial<TaskDraft> {
  const fields = [
    "title",
    "description",
    "status",
    "priority",
    "assigneeActorEntityId",
    "dueDate",
  ] as const;
  return Object.fromEntries(
    fields.flatMap((key) => (current[key] !== draft[key] ? [[key, draft[key]]] : [])),
  );
}
