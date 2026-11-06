export type ProjectPermission = "view" | "comment" | "edit" | "owner";
export interface Project {
  entityId: string;
  name: string;
  description: string;
}
export interface TaskStatus {
  id: string;
  name: string;
  category: "todo" | "active" | "done" | "canceled";
}
export interface Task {
  entityId: string;
  projectEntityId: string;
  parentTaskEntityId: string | null;
  title: string;
  description: string;
  statusId: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeActorEntityId: string | null;
  dueDate: string | null;
}
export type TaskDraft = Omit<Task, "entityId" | "projectEntityId" | "parentTaskEntityId">;
export interface ProjectDetail {
  project: Project;
  level: ProjectPermission;
  statuses: TaskStatus[];
  members: {
    actorEntityId: string;
    name: string;
    type: "human" | "agent";
    level: ProjectPermission;
  }[];
  actors: { entityId: string; name: string; type: "human" | "agent" }[];
  tasks: Task[];
}
export interface TaskComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date | string;
}
