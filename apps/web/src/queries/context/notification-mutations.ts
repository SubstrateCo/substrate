import {
  mutationOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { markNotificationGroupsRead, type GroupRead } from "./notification-groups";
import { markAllRead, markGroupRead } from "@/api/context/notifications";

const notificationApi = { markGroupRead, markAllRead };

export function readNotificationsOptions(
  client: QueryClient,
  organizationId: string,
  api: { markGroupRead: typeof markGroupRead; markAllRead: typeof markAllRead } = notificationApi,
) {
  // Read state changes at once. A failed write reloads the feed, so the row shows unread again.
  return mutationOptions({
    mutationFn: (target: GroupRead) =>
      target
        ? api.markGroupRead({ data: { organizationId, ...target } })
        : api.markAllRead({ data: { organizationId } }),
    onMutate: async (target) => {
      await client.cancelQueries({ queryKey: queryKeys.notifications(organizationId) });
      markNotificationGroupsRead(client, organizationId, target);
    },
    // One group read cannot prove that no other unread groups exist. Ask the server once the write
    // commits; the realtime hint is best-effort, and onMutate may have cancelled a dot read.
    onSuccess: (_result, target) =>
      target
        ? client.invalidateQueries({ queryKey: queryKeys.notificationUnread(organizationId) })
        : undefined,
    onError: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications(organizationId) });
    },
  });
}

export function useReadNotifications(organizationId: string) {
  const client = useQueryClient();
  return useMutation(readNotificationsOptions(client, organizationId));
}
