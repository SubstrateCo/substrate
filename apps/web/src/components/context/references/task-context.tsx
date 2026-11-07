import { useQuery } from "@tanstack/react-query";

import { WorkDiscussions } from "../discussions/work-discussions";
import { TaskActivity } from "@/components/context/activity/task-activity";
import { ProjectReference } from "@/components/context/references/project-reference";
import { workHref } from "@/lib/navigation/record-links";
import { activityOptions } from "@/queries/context/activity";

export function TaskContext({
  organizationId,
  taskEntityId,
  projectEntityId,
  projectName,
  visible,
}: {
  organizationId: string;
  taskEntityId: string;
  projectEntityId: string;
  projectName: string;
  visible: boolean;
}) {
  const activity = useQuery({ ...activityOptions(organizationId, taskEntityId), enabled: visible });
  return (
    <>
      <WorkDiscussions organizationId={organizationId} entityId={taskEntityId} visible={visible}>
        <ProjectReference href={workHref(organizationId, projectEntityId)} name={projectName} />
      </WorkDiscussions>
      <TaskActivity
        items={activity.data ?? []}
        loading={activity.isPending}
        error={activity.error}
        onRetry={() => void activity.refetch()}
      />
    </>
  );
}
