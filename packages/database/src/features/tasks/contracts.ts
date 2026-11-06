export interface TaskFields {
  title: string;
  description: string;
  statusId: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeActorEntityId: string | null;
  dueDate: string | null;
}

export interface CreateTaskInput extends Partial<Omit<TaskFields, "title">> {
  projectEntityId: string;
  parentTaskEntityId?: string;
  title: string;
}
