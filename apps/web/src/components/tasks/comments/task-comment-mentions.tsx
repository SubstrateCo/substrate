import { useQuery } from "@tanstack/react-query";

import { TaskCommentMentions as TaskCommentMentionsView } from "./task-comment-mentions-view";
import { workHref } from "@/lib/navigation/record-links";
import { commentMentionsQueryOptions } from "@/queries/tasks/options";

/** Comments on other tasks that reference this task or project. */
export function TaskCommentMentions({
  organizationId,
  entityId,
  visible,
}: {
  organizationId: string;
  entityId: string;
  visible: boolean;
}) {
  const mentions = useQuery({
    ...commentMentionsQueryOptions(organizationId, entityId),
    enabled: visible,
  });
  return (
    <TaskCommentMentionsView
      items={(mentions.data ?? []).map((row) => ({
        commentId: row.commentId,
        href: workHref(organizationId, row.projectEntityId, row.taskEntityId),
        taskTitle: row.taskTitle,
        authorName: row.authorName,
        createdAt: row.createdAt,
      }))}
    />
  );
}
