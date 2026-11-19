import type { PermissionLevel, TaskPriority, TaskStatus } from "@substrate/contracts/tasks";
import type { TaskLinkView } from "@substrate/contracts/tasks/links";

export const projectPermissionOptions: { value: PermissionLevel; label: string }[] = [
  { value: "view", label: "Can view" },
  { value: "comment", label: "Can comment" },
  { value: "edit", label: "Can edit" },
  { value: "owner", label: "Owner" },
];
/** Display labels for permission levels, matching the options above. */
export const projectPermissionLabels: Record<PermissionLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  owner: "Owner",
};
export interface Project {
  entityId: string;
  name: string;
  description: string;
  image?: string | null;
}
export interface Task {
  entityId: string;
  projectEntityId: string;
  parentTaskEntityId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeActorEntityId: string | null;
  dueDate: string | null;
  discussionConversationId?: string | null;
}
export type TaskDraft = Omit<
  Task,
  "entityId" | "projectEntityId" | "parentTaskEntityId" | "discussionConversationId"
>;
export interface ProjectDetail {
  project: Project;
  level: PermissionLevel;
  members: {
    actorEntityId: string;
    name: string;
    image?: string | null;
    type: "human" | "agent";
    level: PermissionLevel;
  }[];
  /** `assignable` is false for another user's agent shown only as an existing assignee. */
  actors: {
    entityId: string;
    name: string;
    image?: string | null;
    type: "human" | "agent";
    assignable: boolean;
  }[];
  tasks: Task[];
  /** Every link that touches a task in this project. */
  links: TaskLinkView[];
}
