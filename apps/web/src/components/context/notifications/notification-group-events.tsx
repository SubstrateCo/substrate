import { useInfiniteQuery } from "@tanstack/react-query";

import type { MouseEvent } from "react";

import { NotificationItem, NotificationRowsLoading, type Notification } from "./notification-item";
import { notificationPresentation, showsNotification } from "./notification-presentation";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { notificationGroupEventsOptions } from "@/queries/context/notification-groups";
import { useFirstPageOnLeave } from "@/queries/first-page";

export function NotificationGroupEvents({
  organizationId,
  groupKey,
  onOpen,
}: {
  organizationId: string;
  groupKey: string;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const options = notificationGroupEventsOptions(organizationId, groupKey);
  const events = useInfiniteQuery(options);
  useFirstPageOnLeave(options.queryKey);
  const apps = useOrganizationApps();
  if (events.isPending) return <NotificationRowsLoading label="Loading events" />;
  if (isAccessFailure(events.error))
    return (
      <ContentNotice
        title="Events unavailable"
        description="You may no longer have access to this activity."
      />
    );
  const items = (events.data?.pages ?? []).flatMap((page) =>
    page.items.filter((item) => showsNotification(item, apps.enabled("tasks"))),
  );
  return (
    <div className="flex flex-col gap-2">
      {events.error && (
        <ErrorState
          variant="compact"
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
              <NotificationItem key={item.id} item={view} onOpen={(event) => onOpen(view, event)} />
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
