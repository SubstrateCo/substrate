import { permissionLabels } from "@substrate/contracts/access/levels";
import type { AgentAvatarCode } from "@substrate/contracts/agents";
import {
  permissionLevels,
  type PermissionLevel,
  type TaskPriority,
  type TaskStatus,
} from "@substrate/contracts/tasks";
import type { TaskLinkView } from "@substrate/contracts/tasks/links";

export const projectPermissionOptions = permissionLevels.map((value) => ({
  value,
  label: permissionLabels[value],
}));
export interface Project {
  entityId: string;
  name: string;
  description: string;
  image?: string | null;
  /** Set while the project is archived and read-only. */
  archivedAt?: string | null;
  archivedByActorEntityId?: string | null;
  /** The reader's level, in archived project lists only. */
  level?: PermissionLevel;
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
    /** Set exactly for an agent. */
    avatar: AgentAvatarCode | null;
    type: "human" | "agent";
    level: PermissionLevel;
  }[];
  /** `assignable`: the actor can read the project, so the server accepts them as an assignee. */
  actors: {
    entityId: string;
    name: string;
    image?: string | null;
    /** Set exactly for an agent. */
    avatar: AgentAvatarCode | null;
    type: "human" | "agent";
    assignable: boolean;
  }[];
  tasks: Task[];
  /** Every link that touches a task in this project. */
  links: TaskLinkView[];
}
