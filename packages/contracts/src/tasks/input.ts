import { attachmentFileIds } from "../files/attachments";
import { projectIcon } from "../files/pictures";
import { organizationId } from "../workspace";
import { taskLinkRelations } from "./links";
import { permissionLevels, taskPriorityValues, taskStatusValues } from "./status";
import { z } from "zod";

export const tasksWorkspace = z.object({ organizationId });
export const projectRequest = tasksWorkspace.extend({ projectEntityId: z.uuid() });
export const taskRequest = projectRequest.extend({ taskEntityId: z.uuid() });
export const taskLocationRequest = tasksWorkspace.extend({ taskEntityId: z.uuid() });
/** A task or a project. */
export const workRequest = tasksWorkspace.extend({ entityId: z.uuid() });
const title = z.string().trim().min(1).max(300);
const description = z.string().max(20000);
export const taskFields = z.object({
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
  taskRequest
    .extend({ action: z.literal("updateTask") })
    .extend(taskFields.partial().shape)
    .refine(
      (input) => Object.keys(taskFields.shape).some((key) => key in input),
      "Change at least one task field.",
    ),
  taskRequest.extend({ action: z.literal("comment"), body: z.string().trim().min(1).max(20000) }),
  taskRequest.extend({
    action: z.literal("addTaskLink"),
    relation: z.enum(taskLinkRelations),
    otherTaskEntityId: z.uuid(),
  }),
  taskRequest.extend({ action: z.literal("removeTaskLink"), linkId: z.uuid() }),
  projectRequest.extend({
    action: z.literal("share"),
    actorEntityId: z.uuid(),
    level: z.enum(permissionLevels),
  }),
  projectRequest.extend({ action: z.literal("revoke"), actorEntityId: z.uuid() }),
  projectRequest.extend({ action: z.literal("setProjectPicture"), image: projectIcon }),
  projectRequest.extend({ action: z.literal("deleteProject") }),
  taskRequest.extend({ action: z.literal("deleteTask") }),
  taskRequest.extend({
    action: z.literal("moveTask"),
    destinationProjectEntityId: z.uuid(),
    parentTaskEntityId: z.uuid().nullable(),
  }),
]);

export type TasksWrite = z.input<typeof tasksWrite>;
