import { useInfiniteQuery } from "@tanstack/react-query";

import { activityActionLabel, activityFieldLabel } from "./activity-labels";
import { isAccessFailure } from "@/api/access-failure";
import { TaskActivity } from "@/components/context/activity/task-activity";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { actorIdentity } from "@/lib/actors/identity";
import { resourceState } from "@/lib/resource-state";
import { crmActivityOptions } from "@/queries/crm/activity";
import { useFirstPageOnLeave } from "@/queries/first-page";
import { Unlink } from "lucide-react";

/** A CRM record's internal changes, in the same rows as task activity. */
export function CrmActivity({ entityId }: { entityId: string }) {
  const { organizationId } = useWorkspaceScope();
  const options = crmActivityOptions(organizationId, entityId);
  const query = useInfiniteQuery(options);
  useFirstPageOnLeave(options.queryKey);
  const items = resourceState(query).data?.pages.flatMap((page) => page.items) ?? [];
  const unavailable = isAccessFailure(query.error);
  return (
    <TaskActivity
      label="Activity"
      items={items.map((item) => {
        const action = activityActionLabel[item.action];
        const fields = item.changedFields.map((field) => activityFieldLabel[field]).join(", ");
        return {
          id: item.id,
          action: `${action.charAt(0).toLowerCase()}${action.slice(1)}${fields ? ` · ${fields}` : ""}`,
          // CRM activity hides which agent acted ("Agent on behalf of Alice") and returns no
          // pictures, so an agent shows the Bot mark and a person shows initials.
          actor: actorIdentity({ type: item.actor.type, name: item.actor.displayName }),
          createdAt: item.createdAt,
          source: null,
        };
      })}
      loading={query.isPending}
      error={query.error}
      onRetry={() => {
        if (query.isFetchNextPageError) void query.fetchNextPage();
        else void query.refetch();
      }}
      notice={
        unavailable && (
          <ContentNotice
            variant="compact"
            icon={Unlink}
            title="Activity unavailable"
            description="You may no longer have access to this record’s activity."
          />
        )
      }
      more={
        query.hasNextPage && (
          <PendingButton
            variant="outline"
            size="sm"
            className="mt-2"
            pending={query.isFetching && !query.isPending}
            onClick={() => {
              if (!query.isFetching) void query.fetchNextPage();
            }}
          >
            Load more activity
          </PendingButton>
        )
      }
    />
  );
}
