import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { domainTargets, invalidateTargets } from "../targets";

export function invalidateRecordWrite(client: QueryClient, organizationId: string) {
  return invalidateTargets(client, [
    { queryKey: queryKeys.contacts(organizationId) },
    { queryKey: queryKeys.contactInteractions(organizationId) },
    { queryKey: queryKeys.crm(organizationId) },
    ...domainTargets("context", organizationId),
    { queryKey: queryKeys.tasks(organizationId) },
  ]);
}
