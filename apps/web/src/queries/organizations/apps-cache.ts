import { partialMatchKey, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/queries/keys";

/** Cross-app previews can contain optional-app data too. Drop them rather than retain stale names. */
export async function clearAppData(client: QueryClient, organizationId: string) {
  const prefixes = [
    queryKeys.tasks(organizationId),
    queryKeys.crm(organizationId),
    queryKeys.contacts(organizationId),
    queryKeys.context(organizationId),
    queryKeys.messaging(organizationId),
  ];
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      prefixes.some((prefix) => partialMatchKey(query.queryKey, prefix)),
  };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
}
