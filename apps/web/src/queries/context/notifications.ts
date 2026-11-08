import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNotifications, getNotificationPage } from "@/api/context/notifications";

export const notificationsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "notifications"],
    queryFn: ({ signal }) => getNotifications({ data: { organizationId }, signal }),
    retry: false,
  });

export const notificationPageOptions = (
  organizationId: string,
  filter: "all" | "unread",
  after?: string,
  limit = 20,
) =>
  queryOptions({
    queryKey: [...notificationsOptions(organizationId).queryKey, "page", filter, after, limit],
    queryFn: ({ signal }) =>
      getNotificationPage({ data: { organizationId, filter, after, limit }, signal }),
    retry: false,
  });

// Shows a read state at once. The server refresh still runs, but navigation does not wait for it.
export function markNotificationsRead(
  client: QueryClient,
  organizationId: string,
  id: string | null,
) {
  const { queryKey } = notificationsOptions(organizationId);
  const readAt = new Date().toISOString();
  client.setQueryData(queryKey, (items) =>
    items?.map((item) =>
      id === null || item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item,
    ),
  );
  client.setQueriesData<Awaited<ReturnType<typeof getNotificationPage>>>(
    { queryKey: [...queryKey, "page"] },
    (page) =>
      page && {
        ...page,
        items: page.items.map((item) =>
          id === null || item.id === id ? { ...item, readAt: item.readAt ?? readAt } : item,
        ),
      },
  );
  void client.invalidateQueries({ queryKey });
}
