import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getNotifications } from "@/api/context/notifications";

export const notificationsOptions = (organizationId: string) =>
  queryOptions({
    queryKey: [...queryKeys.context(organizationId), "notifications"],
    queryFn: ({ signal }) => getNotifications({ data: { organizationId }, signal }),
    retry: false,
  });
