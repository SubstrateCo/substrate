import { useQuery } from "@tanstack/react-query";

import { WorkDiscussions } from "../discussions/work-discussions";
import { TaskActivity } from "@/components/context/activity/task-activity";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { messageLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { activityOptions } from "@/queries/context/activity";
import { conversationsQueryOptions } from "@/queries/messaging/options";

export function TaskContext({ taskEntityId, visible }: { taskEntityId: string; visible: boolean }) {
  const { organizationId } = useWorkspaceScope();
  const activity = useQuery({ ...activityOptions(organizationId, taskEntityId), enabled: visible });
  const conversations = useQuery({
    ...conversationsQueryOptions(organizationId),
    enabled: visible,
  });
  return (
    <>
      <WorkDiscussions entityId={taskEntityId} visible={visible} />
      <TaskActivity
        items={(resourceState(activity).data ?? []).map(({ source, ...event }) => ({
          ...event,
          source: source && {
            link: messageLink(organizationId, source.conversationId, source.messageId),
            conversationName: source.conversationName,
            conversationKind: conversations.data?.find(
              (entry) => entry.id === source.conversationId,
            )?.kind,
            private: conversations.data?.find((entry) => entry.id === source.conversationId)
              ?.private,
          },
        }))}
        loading={activity.isPending}
        error={activity.error}
        onRetry={() => void activity.refetch()}
      />
    </>
  );
}
