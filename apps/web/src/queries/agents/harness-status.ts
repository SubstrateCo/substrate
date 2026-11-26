import { queryOptions, skipToken } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { withHarnessSession } from "@/lib/desktop/bridges";

export const harnessStatusQueryOptions = (
  userId: string,
  organizationId: string | null | undefined,
) =>
  queryOptions({
    queryKey: queryKeys.harnessStatus(userId, organizationId ?? ""),
    staleTime: 60_000,
    retry: false,
    queryFn: organizationId
      ? () =>
          withHarnessSession(
            organizationId,
            async (bridge) => (await bridge.status()).harnesses ?? [],
          )
      : skipToken,
  });
