import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { markNotificationGroupsRead, type GroupRead } from "./notification-groups";
import { markAllRead, markGroupRead } from "@/api/context/notifications";

export function useReadNotifications(organizationId: string) {
  const client = useQueryClient();
  // Read state changes at once. A failed write reloads the feed, so the row shows unread again.
  return useMutation({
    mutationFn: (target: GroupRead) =>
      target
        ? markGroupRead({ data: { organizationId, ...target } })
        : markAllRead({ data: { organizationId } }),
    onMutate: async (target) => {
      await client.cancelQueries({ queryKey: queryKeys.notifications(organizationId) });
      markNotificationGroupsRead(client, organizationId, target);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications(organizationId) });
    },
  });
}
