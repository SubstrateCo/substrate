import { useQuery } from "@tanstack/react-query";

import { TaskReferencePicker } from "./task-reference-picker";
import { TaskComments as TaskCommentsView } from "@/components/tasks/comments/task-comments-view";
import type { ProjectDetail } from "@/components/tasks/types";
import { workHref } from "@/lib/navigation/record-links";
import { useTasksMutation } from "@/queries/tasks/mutations";
import { taskCommentsQueryOptions } from "@/queries/tasks/options";

export function TaskComments({
  organizationId,
  detail,
  taskEntityId,
  canComment,
  visible,
  onDirtyChange,
}: {
  organizationId: string;
  detail: ProjectDetail;
  taskEntityId: string;
  canComment: boolean;
  visible: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const projectEntityId = detail.project.entityId;
  const comments = useQuery({
    ...taskCommentsQueryOptions(organizationId, projectEntityId, taskEntityId),
    enabled: visible,
  });
  const send = useTasksMutation(organizationId);
  return (
    <TaskCommentsView
      canComment={canComment}
      comments={(comments.data ?? []).map((comment) => ({
        ...comment,
        references: comment.references.map(({ projectEntityId: project, ...reference }) => ({
          ...reference,
          href: project
            ? workHref(
                organizationId,
                project,
                reference.kind === "task" ? reference.id : undefined,
              )
            : undefined,
        })),
      }))}
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
      renderReferences={(activeReference, onInsert, onClose) => (
        <TaskReferencePicker
          organizationId={organizationId}
          detail={detail}
          activeReference={activeReference}
          onInsert={onInsert}
          onClose={onClose}
        />
      )}
    />
  );
}
