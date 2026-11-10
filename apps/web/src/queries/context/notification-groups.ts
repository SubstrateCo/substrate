import { notificationPosition } from "@startup-os/contracts/context/notification-groups";

import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "../keys";
import {
  getNotificationGroups,
  getNotificationGroupEvents,
  getNotificationUnread,
} from "@/api/context/notifications";

export const notificationUnreadOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.notifications(organizationId), "unread-status"],
    queryFn: ({ signal }) => getNotificationUnread({ data: { organizationId }, signal }),
    retry: false,
  });

export const notificationGroupsOptions = (organizationId: string, filter: "all" | "unread") =>
  infiniteQueryOptions({
    queryKey: [...queryKeys.notifications(organizationId), "groups", filter],
    // SAFETY: The first page has no cursor; later pages use the server's cursor.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      getNotificationGroups({
        data: { organizationId, filter, after: pageParam, limit: 20 },
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

export const notificationGroupEventsOptions = (organizationId: string, groupKey: string) =>
  infiniteQueryOptions({
    queryKey: [...queryKeys.notifications(organizationId), "events", groupKey],
    // SAFETY: The first page has no cursor; later pages use the server's cursor.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      getNotificationGroupEvents({
        data: { organizationId, groupKey, after: pageParam, limit: 20 },
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: false,
  });

export type NotificationGroup = Awaited<ReturnType<typeof getNotificationGroups>>["items"][number];
export type NotificationEvent = Awaited<
  ReturnType<typeof getNotificationGroupEvents>
>["items"][number];
export type GroupRead = { groupKey: string; through: string } | null;

function atOrBefore(cursor: string, through: string) {
  const event = notificationPosition(cursor);
  const cutoff = notificationPosition(through);
  return event.at < cutoff.at || (event.at === cutoff.at && event.id <= cutoff.id);
}

export function markNotificationGroupsRead(
  client: QueryClient,
  organizationId: string,
  target: GroupRead,
) {
  const prefix = queryKeys.notifications(organizationId);
  const readAt = new Date().toISOString();
  type Groups = InfiniteData<Awaited<ReturnType<typeof getNotificationGroups>>>;
  for (const filter of ["all", "unread"] as const) {
    client.setQueryData<Groups>(
      [...prefix, "groups", filter],
      (feed) =>
        feed && {
          ...feed,
          pages: feed.pages.map((page) => ({
            ...page,
            items: page.items
              .map((item) => {
                if (
                  target &&
                  (item.groupKey !== target.groupKey ||
                    !atOrBefore(item.newestCursor, target.through))
                )
                  return item;
                return { ...item, unreadCount: 0, readAt: item.readAt ?? readAt };
              })
              .filter((item) => filter !== "unread" || item.unreadCount > 0),
          })),
        },
    );
  }
  type Events = InfiniteData<Awaited<ReturnType<typeof getNotificationGroupEvents>>>;
  client.setQueriesData<Events>(
    { queryKey: target ? [...prefix, "events", target.groupKey] : [...prefix, "events"] },
    (feed) =>
      feed && {
        ...feed,
        pages: feed.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            !target || atOrBefore(item.eventCursor, target.through)
              ? { ...item, readAt: item.readAt ?? readAt }
              : item,
          ),
        })),
      },
  );
  // A loaded page cannot prove that no other unread groups exist.
  if (target === null)
    client.setQueryData(notificationUnreadOptions(organizationId).queryKey, { unread: false });
}
