import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getActivity } from "@/api/context/activity";

export const activityOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: queryKeys.activity(organizationId, entityId),
    queryFn: ({ signal }) => getActivity({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
