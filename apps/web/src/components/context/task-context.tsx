import { useQuery } from "@tanstack/react-query";
import { TaskActivity } from "@/ui/context/task-activity";
import { ProjectReference } from "@/ui/context/project-reference";
import { activityOptions } from "@/queries/context/options";
import { workHref } from "@/lib/context-links";
import { WorkDiscussions } from "./work-discussions";

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
