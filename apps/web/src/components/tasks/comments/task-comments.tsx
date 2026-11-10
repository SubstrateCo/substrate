import { useQuery } from "@tanstack/react-query";

import { TaskComments as TaskCommentsView } from "@/components/tasks/comments/task-comments-view";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { taskCommentsQueryOptions } from "@/queries/tasks/options";

export function TaskComments({
  organizationId,
  projectEntityId,
  taskEntityId,
  canComment,
  visible,
  onDirtyChange,
}: {
  organizationId: string;
  projectEntityId: string;
  taskEntityId: string;
  canComment: boolean;
  visible: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const comments = useQuery({
    ...taskCommentsQueryOptions(organizationId, projectEntityId, taskEntityId),
    enabled: visible,
  });
  const send = useTasksMutation(organizationId);
  return (
    <TaskCommentsView
      canComment={canComment}
      comments={comments.data ?? []}
      loading={comments.isPending}
      error={comments.error}
      pending={send.isPending}
      actionError={send.error}
      onDirtyChange={onDirtyChange}
      onRetry={() => void comments.refetch()}
      onSend={(body, onSuccess) =>
        send.mutate(
          { action: "comment", organizationId, projectEntityId, taskEntityId, body },
          { onSuccess },
        )
      }
    />
  );
}
