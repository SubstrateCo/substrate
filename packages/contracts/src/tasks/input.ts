import { attachmentFileIds } from "../files/attachments";
import { projectIcon } from "../files/pictures";
import { organizationId } from "../workspace";
import { permissionLevels, taskPriorityValues, taskStatusValues } from "./status";
import { z } from "zod";

export const tasksWorkspace = z.object({ organizationId });
export const projectRequest = tasksWorkspace.extend({ projectEntityId: z.uuid() });
export const taskRequest = projectRequest.extend({ taskEntityId: z.uuid() });
const title = z.string().trim().min(1).max(300);
const description = z.string().max(20000);
const taskFields = z.object({
  title,
  description,
  status: z.enum(taskStatusValues),
  priority: z.enum(taskPriorityValues),
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
    .extend({
      action: z.literal("createTask"),
      parentTaskEntityId: z.uuid().optional(),
      attachmentFileIds: attachmentFileIds.optional(),
    })
    .extend(taskFields.partial().extend({ title }).shape),
  taskRequest.extend({ action: z.literal("updateTask") }).extend(taskFields.shape),
  taskRequest.extend({ action: z.literal("comment"), body: z.string().trim().min(1).max(20000) }),
  projectRequest.extend({
    action: z.literal("share"),
    actorEntityId: z.uuid(),
    level: z.enum(permissionLevels),
  }),
  projectRequest.extend({ action: z.literal("revoke"), actorEntityId: z.uuid() }),
  projectRequest.extend({ action: z.literal("setProjectPicture"), image: projectIcon }),
]);

export type TasksWrite = z.input<typeof tasksWrite>;
