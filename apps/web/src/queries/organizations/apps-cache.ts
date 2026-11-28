import { partialMatchKey, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/queries/keys";

export async function clearAppData(client: QueryClient, organizationId: string, userId: string) {
  const prefixes = [
    queryKeys.tasks(organizationId),
    queryKeys.crm(organizationId),
    queryKeys.contacts(organizationId),
    queryKeys.context(organizationId),
    queryKeys.messaging(organizationId),
    queryKeys.calendar(organizationId),
    queryKeys.mail(userId, organizationId),
  ];
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      prefixes.some((prefix) => partialMatchKey(query.queryKey, prefix)),
  };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
}
