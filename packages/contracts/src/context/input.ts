import { taskPriorityValues, taskStatusValues } from "../tasks/status";
import { z } from "zod";

export const contextWorkspace = z.object({ organizationId: z.string().min(1).max(200) });
export const contextEntity = contextWorkspace.extend({ entityId: z.uuid() });
export const contextMessage = contextWorkspace.extend({ messageId: z.uuid() });
export const contextMessagePage = contextWorkspace.extend({
  messageIds: z.array(z.uuid()).max(50),
});
export const contextTarget = contextMessage.extend({ conversationId: z.uuid() });
export const contextLink = contextMessage.extend({ entityId: z.uuid() });
export const contextSearch = contextWorkspace.extend({
  query: z.string().max(200),
  kind: z
    .enum([
      "all",
      "task",
      "project",
      "message",
      "conversation",
      "person",
      "agent",
      "channel",
      "thread",
    ])
    .optional(),
  after: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  conversationId: z.uuid().optional(),
  editable: z.boolean().optional(),
  relatedToEntityId: z.uuid().optional(),
});
export const contextSourceTask = contextMessage.extend({
  requestId: z.uuid(),
  projectEntityId: z.uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: z.enum(taskStatusValues).optional(),
  priority: z.enum(taskPriorityValues).optional(),
  assigneeActorEntityId: z.uuid().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});
export const contextNotification = contextWorkspace.extend({ id: z.uuid() });
export const contextNotificationPage = contextWorkspace.extend({
  after: z.uuid().optional(),
  filter: z.enum(["all", "unread"]).default("all"),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
