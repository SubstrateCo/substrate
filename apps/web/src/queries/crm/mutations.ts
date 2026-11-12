import type { CrmWrite } from "@substrate/contracts/crm/input";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { domainTargets, invalidateTargets } from "../targets";
import { mutateCrm } from "@/api/crm/requests";

export function useCrmMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: CrmWrite) => mutateCrm({ data }),
    onSuccess: () => invalidateCrmWrite(client, organizationId),
  });
}

export function invalidateCrmWrite(client: QueryClient, organizationId: string) {
  return invalidateTargets(client, [
    { queryKey: queryKeys.crm(organizationId) },
    ...domainTargets("context", organizationId),
    { queryKey: queryKeys.tasks(organizationId) },
  ]);
}
