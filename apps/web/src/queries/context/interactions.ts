import type { InteractionWrite } from "@substrate/contracts/context/interactions";

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateRecordWrite } from "../records/invalidation";
import { listInteractions, mutateInteraction } from "@/api/context/interactions";

export const interactionsOptions = (organizationId: string, contactEntityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(organizationId), contactEntityId],
    queryFn: ({ signal }) =>
      listInteractions({ data: { organizationId, contactEntityId }, signal }),
    retry: false,
  });
export function useInteractionMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: InteractionWrite) => mutateInteraction({ data }),
    onSuccess: () => invalidateRecordWrite(client, organizationId),
  });
}
