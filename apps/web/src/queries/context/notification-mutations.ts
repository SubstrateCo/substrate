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
  return mutationOptions({
    mutationFn: (target: GroupRead) =>
      target
        ? api.markGroupRead({ data: { organizationId, ...target } })
        : api.markAllRead({ data: { organizationId } }),
    onMutate: async (target) => {
      await client.cancelQueries({ queryKey: queryKeys.notifications(organizationId) });
      markNotificationGroupsRead(client, organizationId, target);
    },
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
