import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@startup-os/ui/feedback/error-state";
import { LoadingState } from "@startup-os/ui/feedback/loading-state";
import { activityOptions } from "@/queries/context/options";
import { workHref } from "@/lib/context-links";
import { WorkDiscussions } from "./work-discussions";
import { isAccessFailure } from "@startup-os/ui/feedback/request-failure";

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
        <a className="text-sm underline" href={workHref(organizationId, projectEntityId)}>
          Project: {projectName}
        </a>
      </WorkDiscussions>
      <section aria-label="Task activity" className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">Activity</h3>
        {activity.isPending && <LoadingState label="Loading activity" variant="compact" />}
        {activity.error && (
          <ErrorState
            compact
            title="Couldn’t load activity"
            onRetry={() => void activity.refetch()}
          />
        )}
        {!isAccessFailure(activity.error) &&
          activity.data?.map((event) => (
            <p key={event.id} className="text-sm">
              {event.action} · {event.actorName}
            </p>
          ))}
      </section>
    </>
  );
}
