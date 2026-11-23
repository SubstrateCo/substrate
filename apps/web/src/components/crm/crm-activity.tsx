import { useInfiniteQuery } from "@tanstack/react-query";

import { activityActionLabel, activityFieldLabel } from "./activity-labels";
import { isAccessFailure } from "@/api/access-failure";
import { TaskActivity } from "@/components/context/activity/task-activity";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { resourceState } from "@/lib/resource-state";
import { crmActivityOptions } from "@/queries/crm/activity";
import { Unlink } from "lucide-react";

/** A CRM record's internal changes, in the same rows as task activity. */
export function CrmActivity({
  organizationId,
  entityId,
}: {
  organizationId: string;
  entityId: string;
}) {
  const query = useInfiniteQuery(crmActivityOptions(organizationId, entityId));
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
          actorName: item.actor.displayName,
          actorType: item.actor.type,
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
