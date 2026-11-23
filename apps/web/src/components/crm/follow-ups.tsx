import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmResourceState } from "./crm-resource-state";
import { FollowUpEditor } from "./follow-up-editor";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { DueDate } from "@/components/time/due-date";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { workLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { followUpsOptions } from "@/queries/crm/options";
import { Plus } from "lucide-react";

export function FollowUps({
  organizationId,
  entityId,
  canCreate,
}: {
  organizationId: string;
  entityId: string;
  canCreate: boolean;
}) {
  const apps = useOrganizationApps();
  // Follow-ups are CRM tasks: the server reads and creates them only with both apps on.
  if (!apps.enabled("crm") || !apps.enabled("tasks")) return null;
  return (
    <EnabledFollowUps organizationId={organizationId} entityId={entityId} canCreate={canCreate} />
  );
}

function EnabledFollowUps({
  organizationId,
  entityId,
  canCreate,
}: {
  organizationId: string;
  entityId: string;
  canCreate: boolean;
}) {
  const query = useQuery(followUpsOptions(organizationId, entityId));
  const [creating, setCreating] = useState(false);
  const data = resourceState(query).data;
  return (
    <section aria-label="Follow-ups" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Follow-ups</h2>
        {canCreate && (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New follow-up
          </Button>
        )}
      </div>
      <CrmResourceState
        compact
        noun="follow-ups"
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        loading={
          <div role="status" aria-label="Loading follow-ups">
            <ul className="divide-y" aria-hidden="true">
              {[0, 1, 2].map((key) => (
                <li key={key}>
                  <FollowUpRow>
                    <span className="size-4 shrink-0 overflow-hidden rounded-full">
                      <Skeleton className="size-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <SkeletonText width="10rem" />
                    </span>
                    <span className="text-xs">
                      <SkeletonText width="5rem" />
                    </span>
                  </FollowUpRow>
                </li>
              ))}
            </ul>
          </div>
        }
      />
      {data && !query.error && (
        <>
          {!data.nextAction && (
            <ContentNotice variant="inline" title="No scheduled next action you can read" />
          )}
          <ul className="divide-y">
            {data.tasks.map((task) => (
              <li key={task.entityId}>
                <Link
                  {...workLink(organizationId, task.projectEntityId, task.entityId)}
                  className="rounded-md hover:bg-row-hover"
                >
                  <FollowUpRow>
                    <TaskStatusIcon status={task.status} />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.dueDate ? (
                      <DueDate value={task.dueDate} />
                    ) : (
                      <span className="text-xs text-muted-foreground">Unscheduled</span>
                    )}
                  </FollowUpRow>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Readable linked open tasks only. Open a task to assign, reschedule, or complete it.
          </p>
        </>
      )}
      {creating && (
        <FollowUpEditor
          organizationId={organizationId}
          entityId={entityId}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}

function FollowUpRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 px-2 py-2 text-sm">{children}</div>;
}
