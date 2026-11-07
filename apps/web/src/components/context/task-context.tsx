import { useQuery } from "@tanstack/react-query";

import { WorkDiscussions } from "./work-discussions";
import { ProjectReference } from "@/components/context/project-reference";
import { TaskActivity } from "@/components/context/task-activity";
import { workHref } from "@/lib/context-links";
import { activityOptions } from "@/queries/context/options";

export function TaskContext({
  organizationId,
  taskEntityId,
  projectEntityId,
  projectName,
}: {
  organizationId: string;
  taskEntityId: string;
  projectEntityId: string;
  projectName: string;
}) {
  const activity = useQuery(activityOptions(organizationId, taskEntityId));
  return (
    <>
      <WorkDiscussions organizationId={organizationId} entityId={taskEntityId}>
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
