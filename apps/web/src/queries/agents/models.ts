import type { HarnessKind } from "@substrate/contracts/harness";
import type {} from "@substrate/contracts/harness/desktop";

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";

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
    queryFn: async () => {
      const bridge = window.substrateHarness;
      if (!bridge || !organizationId) throw new Error("Select a workspace in the desktop app.");
      const session = await bridge.synchronize();
      if (session.organizationId !== organizationId)
        throw new Error("Workspace changed. Reopen the picker.");
      return bridge.listModels({ harness, agentId });
    },
  });
