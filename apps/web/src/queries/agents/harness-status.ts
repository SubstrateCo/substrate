import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { withHarnessSession } from "@/lib/desktop/bridges";

export const harnessStatusQueryOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.harnessStatus(userId, organizationId),
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      withHarnessSession(organizationId, async (bridge) => (await bridge.status()).harnesses ?? []),
  });
