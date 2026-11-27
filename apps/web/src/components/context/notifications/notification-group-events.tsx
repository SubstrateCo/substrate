import { useInfiniteQuery } from "@tanstack/react-query";

import type { MouseEvent } from "react";

import { NotificationItem, NotificationRowsLoading, type Notification } from "./notification-item";
import { notificationPresentation, showsNotification } from "./notification-presentation";
import { isAccessFailure } from "@/api/access-failure";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { PendingButton } from "@/components/feedback/pending-button";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { listPhase } from "@/lib/resource-state";
import { notificationGroupEventsOptions } from "@/queries/context/notification-groups";
import { useFirstPageOnLeave } from "@/queries/first-page";

export function NotificationGroupEvents({
  groupKey,
  onOpen,
}: {
  groupKey: string;
  onOpen: (item: Notification, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { organizationId } = useWorkspaceScope();
  const options = notificationGroupEventsOptions(organizationId, groupKey);
  const events = useInfiniteQuery(options);
  useFirstPageOnLeave(options.queryKey);
  const apps = useOrganizationApps();
  const items = (events.data?.pages ?? []).flatMap((page) =>
    page.items.filter((item) => showsNotification(item, apps.enabled("tasks"))),
  );
  const retry = () =>
    void (events.isFetchNextPageError ? events.fetchNextPage() : events.refetch());
  return (
    <div className="flex flex-col gap-2">
      <ListBody
        phase={listPhase({ items, loading: events.isPending, error: events.error })}
        loading={<NotificationRowsLoading label="Loading events" />}
        error={
          isAccessFailure(events.error) ? (
            <ContentNotice
              title="Events unavailable"
              description="You may no longer have access to this activity."
            />
          ) : (
            <ErrorState variant="compact" title="Couldn’t load events" onRetry={retry} />
          )
        }
        empty={
          <ContentNotice
            title="No events available"
            description="This activity is no longer available."
          />
        }
        stale={<StaleNotice title="Couldn’t load events" onRetry={retry} />}
      >
        {(rows) => (
          <>
            <ul aria-label="Group events" className="flex flex-col gap-px">
              {rows.map((item) => {
                const view = notificationPresentation(organizationId, item);
                return (
                  <NotificationItem
                    key={item.id}
                    item={view}
                    onOpen={(event) => onOpen(view, event)}
                  />
                );
              })}
            </ul>
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
          </>
        )}
      </ListBody>
    </div>
  );
}
