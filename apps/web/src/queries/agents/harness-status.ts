import type {} from "@startup-os/contracts/harness/desktop";

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "../keys";

export const harnessStatusQueryOptions = (userId: string, organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.harnessStatus(userId, organizationId),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const bridge = window.startupOSHarness;
      if (!bridge || !organizationId) throw new Error("Select a workspace in the desktop app.");
      // Status needs a configured worker; synchronize starts it for this workspace.
      const session = await bridge.synchronize();
      if (session.organizationId !== organizationId) throw new Error("Workspace changed.");
      return (await bridge.status()).harnesses ?? [];
    },
  });
