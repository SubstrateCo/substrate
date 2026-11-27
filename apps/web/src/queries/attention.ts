import { queryOptions } from "@tanstack/react-query";

import { getAttention } from "@/api/attention";
import { queryKeys } from "@/queries/keys";

export const attentionOptions = (userId: string) =>
  queryOptions({
    queryKey: queryKeys.attention(userId),
    queryFn: ({ signal }) => getAttention(signal),
    // Realtime is workspace-scoped. Reconcile other workspaces and missed hints while hidden.
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
