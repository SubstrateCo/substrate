import type { CrmActivityCursor } from "@substrate/contracts/crm/activity";

import { infiniteQueryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { getCrmActivity } from "@/api/crm/activity";

export const crmActivityOptions = (organizationId: string, entityId: string) =>
  infiniteQueryOptions({
    queryKey: queryKeys.crmActivity(organizationId, entityId),
    // SAFETY: The first page has no cursor. Later pages use the server's timestamp and ID pair.
    initialPageParam: null as CrmActivityCursor | null,
    queryFn: ({ signal, pageParam }) =>
      getCrmActivity({ data: { organizationId, entityId, before: pageParam }, signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
