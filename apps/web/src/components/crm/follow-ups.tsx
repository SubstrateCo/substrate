import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmResourceState } from "./crm-resource-state";
import { FollowUpEditor } from "./follow-up-editor";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { DueDate } from "@/components/time/due-date";
import { Button } from "@/components/ui/button";
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
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {data && !query.error && (
        <>
          {!data.nextAction && (
            <p className="text-sm text-muted-foreground">No scheduled next action you can read</p>
          )}
          <ul className="divide-y">
            {data.tasks.map((task) => (
              <li key={task.entityId}>
                <Link
                  {...workLink(organizationId, task.projectEntityId, task.entityId)}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-row-hover"
                >
                  <TaskStatusIcon status={task.status} />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {task.dueDate ? (
                    <DueDate value={task.dueDate} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Unscheduled</span>
                  )}
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
