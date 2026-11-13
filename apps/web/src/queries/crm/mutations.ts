import type { CrmWrite } from "@substrate/contracts/crm/input";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateRecordWrite } from "../records/invalidation";
import { mutateCrm } from "@/api/crm/requests";

export function useCrmMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: CrmWrite) => mutateCrm({ data }),
    onSuccess: () => invalidateRecordWrite(client, organizationId),
  });
}
