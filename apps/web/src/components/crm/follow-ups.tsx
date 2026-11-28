import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";

import { CrmResourceBoundary } from "./crm-resource-state";
import { FollowUpEditor } from "./follow-up-editor";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { RecordSection, RecordSectionAction, recordRows } from "@/components/layout/record-section";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { DueDate } from "@/components/time/due-date";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { workLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { followUpsOptions } from "@/queries/crm/options";
import { Plus } from "lucide-react";

export function FollowUps({ entityId, canCreate }: { entityId: string; canCreate: boolean }) {
  const apps = useOrganizationApps();
  if (!apps.enabled("crm") || !apps.enabled("tasks")) return null;
  return <EnabledFollowUps entityId={entityId} canCreate={canCreate} />;
}

function EnabledFollowUps({ entityId, canCreate }: { entityId: string; canCreate: boolean }) {
  const { organizationId } = useWorkspaceScope();
  const query = useQuery(followUpsOptions(organizationId, entityId));
  const [creating, setCreating] = useState(false);
  const state = resourceState(query);
  return (
    <RecordSection
      aria-label="Follow-ups"
      title="Follow-ups"
      count={state.data?.tasks.length || undefined}
      actions={
        canCreate && (
          <RecordSectionAction label="New follow-up" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
          </RecordSectionAction>
        )
      }
    >
      <CrmResourceBoundary
        compact
        noun="follow-ups"
        state={state}
        onRetry={() => void query.refetch()}
        loading={
          <div role="status" aria-label="Loading follow-ups">
            <ul className={recordRows} aria-hidden="true">
              {[0, 1, 2].map((key) => (
                <Item key={key} asChild size="xs">
                  <li>
                    <ItemMedia>
                      <span className="size-4 overflow-hidden rounded-full">
                        <Skeleton className="size-full" />
                      </span>
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <SkeletonText width="10rem" />
                    </ItemContent>
                    <ItemActions>
                      <span className="text-xs">
                        <SkeletonText width="5rem" />
                      </span>
                    </ItemActions>
                  </li>
                </Item>
              ))}
            </ul>
          </div>
        }
      >
        {(data) => (
          <>
            {!data.nextAction && (
              <ContentNotice variant="inline" title="No scheduled next action you can read" />
            )}
            {data.tasks.length > 0 && (
              <ul className={recordRows}>
                {data.tasks.map((task) => (
                  <li key={task.entityId}>
                    <Item asChild size="xs">
                      <Link {...workLink(organizationId, task.projectEntityId, task.entityId)}>
                        <ItemMedia>
                          <TaskStatusIcon status={task.status} />
                        </ItemMedia>
                        <ItemContent className="min-w-0">
                          <span className="truncate">{task.title}</span>
                        </ItemContent>
                        <ItemActions>
                          {task.dueDate ? (
                            <DueDate value={task.dueDate} />
                          ) : (
                            <span className="text-xs text-muted-foreground">Unscheduled</span>
                          )}
                        </ItemActions>
                      </Link>
                    </Item>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CrmResourceBoundary>
      {creating && <FollowUpEditor entityId={entityId} onClose={() => setCreating(false)} />}
    </RecordSection>
  );
}
