import { organizationId } from "../workspace.ts";
import { z } from "zod";

export const MAX_ATTACHMENTS = 10;
export const attachmentFileIds = z
  .array(z.uuid())
  .max(MAX_ATTACHMENTS)
  .refine((ids) => new Set(ids).size === ids.length, "Select each file only once.");
export interface Attachment {
  id: string;
  fileId: string;
  filename: string;
  size: number;
  contentType: string;
  position: number;
}
export const taskAttachmentTarget = z.object({
  organizationId,
  projectEntityId: z.uuid(),
  taskEntityId: z.uuid(),
});
export const addTaskAttachments = taskAttachmentTarget.extend({
  attachmentFileIds: attachmentFileIds.min(1),
});
export const taskAttachmentRequest = taskAttachmentTarget.extend({ attachmentId: z.uuid() });
export const messageAttachmentRequest = z.object({
  organizationId,
  conversationId: z.uuid(),
  messageId: z.uuid(),
  attachmentId: z.uuid(),
});
