import { useQuery } from "@tanstack/react-query";

import { useTasksMutation } from "./use-tasks-mutation";
import { TaskComments as TaskCommentsView } from "@/components/tasks/task-comments-view";
import { taskCommentsQueryOptions } from "@/queries/tasks/options";

export function TaskComments({
  organizationId,
  projectEntityId,
  taskEntityId,
  canComment,
}: {
  organizationId: string;
  projectEntityId: string;
  taskEntityId: string;
  canComment: boolean;
}) {
  const comments = useQuery(
    taskCommentsQueryOptions(organizationId, projectEntityId, taskEntityId),
  );
  const send = useTasksMutation(organizationId);
  return (
    <TaskCommentsView
      canComment={canComment}
      comments={comments.data ?? []}
      loading={comments.isPending}
      error={comments.error}
      pending={send.isPending}
      actionError={send.error}
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
