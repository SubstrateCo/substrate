import type {
  InteractionPeriod,
  InteractionTimeline,
} from "@substrate/contracts/context/interactions";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { InteractionTable } from "./interaction-table";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { useCursorPages } from "@/components/table";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useInteractionSources } from "@/queries/calendar/interaction-sources";
import { interactionTimelineOptions } from "@/queries/context/interactions";

type Cursor = Pick<InteractionTimeline, "beforeOccurredAt" | "beforeEntityId">;

export function InteractionDay({ period }: { period: InteractionPeriod }) {
  const pages = useCursorPages<Cursor>();
  const query = useQuery({
    ...interactionTimelineOptions({ ...period, ...pages.cursor }),
    placeholderData: keepPreviousData,
  });
  const apps = useOrganizationApps();
  const sources = useInteractionSources(
    period.organizationId,
    query.data?.items ?? [],
    apps.enabled("calendar"),
  );
  if (query.error)
    return (
      <ErrorState
        title="Couldn’t load this day’s interactions"
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data) return <LoadingState label="Loading this day’s interactions" />;
  const { items, nextCursor } = query.data;
  return (
    <div className="overflow-y-auto md:min-h-0 md:flex-1">
      <InteractionTable
        rows={items}
        sources={sources}
        fetching={query.isPlaceholderData}
        pagination={{
          mode: "server",
          pageIndex: pages.pageIndex,
          pageSize: items.length,
          hasNextPage: Boolean(nextCursor),
          onPageChange: (pageIndex) => {
            if (pageIndex < pages.pageIndex) pages.previous();
            else if (nextCursor) pages.next(nextCursor);
          },
        }}
      />
    </div>
  );
}
