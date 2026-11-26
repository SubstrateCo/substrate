import { queryOptions } from "@tanstack/react-query";

import {
  listTaskAttachments,
  listTaskSourceAttachments,
  type TaskAttachmentTarget,
} from "@/api/files/attachments";
import { queryKeys } from "@/queries/keys";

export const taskAttachmentsOptions = ({
  organizationId,
  projectEntityId,
  taskEntityId,
}: TaskAttachmentTarget) =>
  queryOptions({
    queryKey: queryKeys.taskAttachments(organizationId, projectEntityId, taskEntityId),
    queryFn: ({ signal }) =>
      listTaskAttachments({ organizationId, projectEntityId, taskEntityId }, signal),
  });

/** The files of the message the task was created from, when the viewer can open that message. */
export const taskSourceAttachmentsOptions = ({
  organizationId,
  projectEntityId,
  taskEntityId,
}: TaskAttachmentTarget) =>
  queryOptions({
    queryKey: queryKeys.taskSourceAttachments(organizationId, projectEntityId, taskEntityId),
    queryFn: ({ signal }) =>
      listTaskSourceAttachments({ organizationId, projectEntityId, taskEntityId }, signal),
  });
