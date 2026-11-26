import type { QueryClient } from "@tanstack/react-query";

import { queryKeys, type QueryScope } from "@/queries/keys";

/** Records also appear in message context, reference search, discussions, and activity. */
export function refreshRecords(client: QueryClient, scope: QueryScope, reset = false) {
  const queryKey = queryKeys.workspace(scope);
  return reset ? client.resetQueries({ queryKey }) : client.invalidateQueries({ queryKey });
}
