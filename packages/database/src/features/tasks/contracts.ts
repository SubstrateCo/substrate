import type { TaskStatus } from "@startup-os/contracts/tasks";

export interface TaskFields {
  title: string;
  description: string;
  status: TaskStatus;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeActorEntityId: string | null;
  dueDate: string | null;
}

export interface CreateTaskInput extends Partial<Omit<TaskFields, "title">> {
  projectEntityId: string;
  parentTaskEntityId?: string;
  title: string;
}
