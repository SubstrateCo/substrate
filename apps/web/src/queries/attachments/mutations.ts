import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  attachTaskFiles,
  removeTaskAttachment,
  type TaskAttachmentTarget,
} from "@/api/files/attachments";
import { taskAttachmentsOptions } from "@/queries/files/attachments";

export function useTaskAttachmentMutations(target: TaskAttachmentTarget) {
  const client = useQueryClient();
  const onSuccess = () =>
    client.invalidateQueries({ queryKey: taskAttachmentsOptions(target).queryKey });
  const add = useMutation({
    mutationFn: (attachmentFileIds: string[]) => attachTaskFiles({ ...target, attachmentFileIds }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (attachmentId: string) => removeTaskAttachment({ ...target, attachmentId }),
    onSuccess,
  });
  return { add, remove };
}
