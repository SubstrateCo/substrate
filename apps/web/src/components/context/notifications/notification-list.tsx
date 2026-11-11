import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState, type MouseEvent } from "react";

import { NotificationGroupEvents } from "./notification-group-events";
import type { Notification } from "./notification-item";
import { notificationPresentation } from "./notification-presentation";
import { markAllRead, markGroupRead } from "@/api/context/notifications";
import { NotificationList as NotificationListView } from "@/components/context/notifications/notification-list-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { resourceState } from "@/lib/resource-state";
import {
  markNotificationGroupsRead,
  notificationGroupsOptions,
  type GroupRead,
} from "@/queries/context/notification-groups";
import { queryKeys } from "@/queries/keys";
import { toast } from "sonner";

export function NotificationList({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose?: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const feed = useInfiniteQuery(notificationGroupsOptions(organizationId, filter));
  const resource = resourceState(feed);
  const client = useQueryClient();
  const navigate = useNavigate();
  // Read state changes at once. A failed write reloads the feed, so the row shows unread again.
  const read = useMutation({
    mutationFn: (target: GroupRead) =>
      target
        ? markGroupRead({ data: { organizationId, ...target } })
        : markAllRead({ data: { organizationId } }),
    onMutate: async (target) => {
      await client.cancelQueries({ queryKey: queryKeys.notifications(organizationId) });
      markNotificationGroupsRead(client, organizationId, target);
    },
    onError: (error) => {
      toast.error(actionErrorMessage(error, "Couldn’t mark notifications as read. Try again."));
      void client.invalidateQueries({ queryKey: queryKeys.notifications(organizationId) });
    },
  });
  // A group can move above a saved cursor while older pages load. Keep its first occurrence.
  const groups = new Map<string, NonNullable<typeof feed.data>["pages"][number]["items"][number]>();
  for (const page of resource.data?.pages ?? [])
    for (const item of page.items) if (!groups.has(item.groupKey)) groups.set(item.groupKey, item);
  const items = [...groups.values()].map((item) => ({
    ...notificationPresentation(organizationId, item),
    id: item.groupKey,
  }));
  const mark = (groupKey: string) => {
    const group = groups.get(groupKey);
    if (group && group.unreadCount > 0) read.mutate({ groupKey, through: group.newestCursor });
  };
  const open = (groupKey: string, item: Notification, event: MouseEvent<HTMLAnchorElement>) => {
    mark(groupKey);
    const modified = [event.metaKey, event.ctrlKey, event.shiftKey, event.altKey].some(Boolean);
    if (event.button !== 0 || modified) return;
    event.preventDefault();
    onClose?.();
    void navigate({ to: item.href });
  };
  return (
    <NotificationListView
      state={resource.status}
      items={items}
      loading={feed.isPending}
      error={feed.error}
      filter={filter}
      onFilter={setFilter}
      hasMore={feed.hasNextPage}
      loadingMore={feed.isFetchingNextPage}
      onMore={() => {
        if (!feed.isFetching) void feed.fetchNextPage();
      }}
      readingAll={read.isPending && read.variables === null}
      onRetry={() => void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch())}
      onRead={mark}
      onReadAll={() => read.mutate(null)}
      onOpen={(item, event) => open(item.id, item, event)}
      renderEvents={(item) => (
        <NotificationGroupEvents
          organizationId={organizationId}
          groupKey={item.id}
          onOpen={(eventItem, event) => open(item.id, eventItem, event)}
        />
      )}
      onClose={onClose}
    />
  );
}
