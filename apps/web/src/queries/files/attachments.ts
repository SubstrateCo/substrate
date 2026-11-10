import { queryOptions } from "@tanstack/react-query";

import { listTaskAttachments, type TaskAttachmentTarget } from "@/api/files/attachments";
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
