import type { HarnessKind } from "@substrate/contracts/harness";

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { withHarnessSession } from "@/lib/desktop/bridges";

export const harnessModelsQueryOptions = (
  userId: string,
  organizationId: string,
  harness: HarnessKind,
  agentId?: string,
) =>
  queryOptions({
    queryKey: queryKeys.harnessModels(userId, organizationId, harness, agentId),
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      withHarnessSession(organizationId, (bridge) => bridge.listModels({ harness, agentId })),
  });
