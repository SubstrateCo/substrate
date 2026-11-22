import type {
  InteractionPeriod,
  InteractionTimeline,
  InteractionWrite,
  InteractionDirectory,
} from "@substrate/contracts/context/interactions";

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateRecordWrite } from "../records/invalidation";
import {
  getInteractionActivity,
  getInteractionTimeline,
  getInteractionDirectory,
  getInteractionRecord,
  getInteractionProfile,
  listInteractions,
  mutateInteraction,
} from "@/api/context/interactions";

export const interactionsOptions = (organizationId: string, contactEntityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(organizationId), contactEntityId],
    queryFn: ({ signal }) =>
      listInteractions({ data: { organizationId, contactEntityId }, signal }),
    retry: false,
  });
export const interactionActivityOptions = (data: InteractionPeriod) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(data.organizationId), "activity", data],
    queryFn: ({ signal }) => getInteractionActivity({ data, signal }),
    retry: false,
  });
export const interactionTimelineOptions = (data: InteractionTimeline) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(data.organizationId), "timeline", data],
    queryFn: ({ signal }) => getInteractionTimeline({ data, signal }),
    retry: false,
  });
export const interactionDirectoryOptions = (data: InteractionDirectory) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(data.organizationId), "directory", data],
    queryFn: ({ signal }) => getInteractionDirectory({ data, signal }),
    retry: false,
  });
export const interactionRecordOptions = (organizationId: string, entityId: string) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(organizationId), "record", entityId],
    queryFn: ({ signal }) => getInteractionRecord({ data: { organizationId, entityId }, signal }),
    retry: false,
  });
export const interactionProfileOptions = (
  organizationId: string,
  entityId: string,
  type: "person" | "account",
) =>
  queryOptions({
    queryKey: [...queryKeys.contactInteractions(organizationId), "profile", entityId, type],
    queryFn: ({ signal }) =>
      getInteractionProfile({ data: { organizationId, entityId, type }, signal }),
    retry: false,
  });
export function useInteractionMutation(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: InteractionWrite) => mutateInteraction({ data }),
    onSuccess: () => invalidateRecordWrite(client, organizationId),
  });
}
