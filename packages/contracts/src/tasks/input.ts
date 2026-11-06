import { z } from "zod";
import { taskStatusValues } from "./status";

export const tasksWorkspace = z.object({ organizationId: z.string().min(1) });
export const projectRequest = tasksWorkspace.extend({ projectEntityId: z.uuid() });
export const taskRequest = projectRequest.extend({ taskEntityId: z.uuid() });
const title = z.string().trim().min(1).max(300);
const description = z.string().max(20000);
const taskFields = z.object({
  title,
  description,
  status: z.enum(taskStatusValues),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]),
  assigneeActorEntityId: z.uuid().nullable(),
  dueDate: z.iso.date().nullable(),
});

export const tasksWrite = z.discriminatedUnion("action", [
  tasksWorkspace.extend({
    action: z.literal("createProject"),
    name: z.string().trim().min(1).max(200),
    description: description.optional(),
  }),
  projectRequest.extend({
    action: z.literal("updateProject"),
    name: z.string().trim().min(1).max(200),
    description,
  }),
  projectRequest
    .extend({ action: z.literal("createTask"), parentTaskEntityId: z.uuid().optional() })
    .extend(taskFields.partial().extend({ title }).shape),
  taskRequest.extend({ action: z.literal("updateTask") }).extend(taskFields.shape),
  taskRequest.extend({ action: z.literal("comment"), body: z.string().trim().min(1).max(20000) }),
  projectRequest.extend({
    action: z.literal("share"),
    actorEntityId: z.uuid(),
    level: z.enum(["view", "comment", "edit", "owner"]),
  }),
  projectRequest.extend({ action: z.literal("revoke"), actorEntityId: z.uuid() }),
]);

export type TasksWrite = z.input<typeof tasksWrite>;
