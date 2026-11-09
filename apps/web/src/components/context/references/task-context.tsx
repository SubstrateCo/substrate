import { useQuery } from "@tanstack/react-query";

import { WorkDiscussions } from "../discussions/work-discussions";
import { TaskActivity } from "@/components/context/activity/task-activity";
import { messageHref } from "@/lib/navigation/record-links";
import { activityOptions } from "@/queries/context/activity";

export function TaskContext({
  organizationId,
  taskEntityId,
  visible,
}: {
  organizationId: string;
  taskEntityId: string;
  visible: boolean;
}) {
  const activity = useQuery({ ...activityOptions(organizationId, taskEntityId), enabled: visible });
  return (
    <>
      <WorkDiscussions organizationId={organizationId} entityId={taskEntityId} visible={visible} />
      <TaskActivity
        items={(activity.data ?? []).map(({ source, ...event }) => ({
          ...event,
          source: source && {
            href: messageHref(organizationId, source.conversationId, source.messageId),
            conversationName: source.conversationName,
          },
        }))}
        loading={activity.isPending}
        error={activity.error}
        onRetry={() => void activity.refetch()}
      />
    </>
  );
}
