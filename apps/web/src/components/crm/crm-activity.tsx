import { useInfiniteQuery } from "@tanstack/react-query";

import { ActivityList } from "./activity-list";
import { resourceState } from "@/lib/resource-state";
import { crmActivityOptions } from "@/queries/crm/activity";

export function CrmActivity({
  organizationId,
  entityId,
}: {
  organizationId: string;
  entityId: string;
}) {
  const query = useInfiniteQuery(crmActivityOptions(organizationId, entityId));
  const state = resourceState(query);
  return (
    <ActivityList
      items={state.data?.pages.flatMap((page) => page.items) ?? []}
      loading={query.isPending}
      error={query.error}
      loadingMore={query.isFetching && !query.isPending}
      hasMore={query.hasNextPage}
      onRetry={() => {
        if (query.isFetchNextPageError) void query.fetchNextPage();
        else void query.refetch();
      }}
      onLoadMore={() => {
        if (!query.isFetching) void query.fetchNextPage();
      }}
    />
  );
}
