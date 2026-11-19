import { useInfiniteQuery } from "@tanstack/react-query";

import type { MouseEvent } from "react";

import { NotificationItem, type Notification } from "./notification-item";
import { notificationPresentation } from "./notification-presentation";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { notificationGroupEventsOptions } from "@/queries/context/notification-groups";

export function NotificationGroupEvents({
  organizationId,
  groupKey,
  onOpen,
}: {
  organizationId: string;
  groupKey: string;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const events = useInfiniteQuery(notificationGroupEventsOptions(organizationId, groupKey));
  if (events.isPending) return <LoadingState label="Loading events" variant="compact" />;
  if (isAccessFailure(events.error))
    return (
      <ContentNotice
        title="Events unavailable"
        description="You may no longer have access to this activity."
      />
    );
  const items = (events.data?.pages ?? []).flatMap((page) => page.items);
  return (
    <div className="flex flex-col gap-2">
      {events.error && (
        <ErrorState
          compact
          title="Couldn’t load events"
          onRetry={() =>
            void (events.isFetchNextPageError ? events.fetchNextPage() : events.refetch())
          }
        />
      )}
      {!events.error && !items.length && (
        <ContentNotice
          title="No events available"
          description="This activity is no longer available."
        />
      )}
      {!!items.length && (
        <ul aria-label="Group events" className="flex flex-col gap-px">
          {items.map((item) => {
            const view = notificationPresentation(organizationId, item);
            return (
              <NotificationItem
                key={item.id}
                item={view}
                showReadAction={false}
                onRead={() => {}}
                onOpen={(event) => onOpen(view, event)}
              />
            );
          })}
        </ul>
      )}
      {events.hasNextPage && (
        <PendingButton
          variant="ghost"
          size="sm"
          className="self-start"
          pending={events.isFetchingNextPage}
          pendingLabel="Loading older events."
          onClick={() => {
            if (!events.isFetching) void events.fetchNextPage();
          }}
        >
          Show older events
        </PendingButton>
      )}
    </div>
  );
}
