import type { TaskStatus } from "@startup-os/contracts/tasks";

export type ProjectPermission = "view" | "comment" | "edit" | "owner";
export interface Project {
  entityId: string;
  name: string;
  description: string;
}
export interface Task {
  entityId: string;
  projectEntityId: string;
  parentTaskEntityId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeActorEntityId: string | null;
  dueDate: string | null;
}
export type TaskDraft = Omit<Task, "entityId" | "projectEntityId" | "parentTaskEntityId">;
export interface ProjectDetail {
  project: Project;
  level: ProjectPermission;
  members: {
    actorEntityId: string;
    name: string;
    type: "human" | "agent";
    level: ProjectPermission;
  }[];
  /** `assignable` is false for another user's agent shown only as an existing assignee. */
  actors: { entityId: string; name: string; type: "human" | "agent"; assignable: boolean }[];
  tasks: Task[];
}
export interface TaskComment {
  id: string;
  authorName: string;
  authorType?: "human" | "agent";
  body: string;
  createdAt: Date | string;
}
