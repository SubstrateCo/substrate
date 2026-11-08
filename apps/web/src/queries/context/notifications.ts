import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNotifications } from "@/api/context/notifications";

export const notificationsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "notifications"],
    queryFn: ({ signal }) => getNotifications({ data: { organizationId }, signal }),
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
  void client.invalidateQueries({ queryKey, exact: true });
}
