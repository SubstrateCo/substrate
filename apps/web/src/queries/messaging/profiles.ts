import { queryOptions } from "@tanstack/react-query";

import { getProfile } from "@/api/messaging/requests";
import { queryKeys } from "@/queries/keys";

export const messagingProfileOptions = (
  organizationId: string,
  conversationId: string,
  actorId: string,
) =>
  queryOptions({
    queryKey: queryKeys.messagingProfile(organizationId, conversationId, actorId),
    queryFn: ({ signal }) =>
      getProfile({ data: { organizationId, conversationId, actorId }, signal }),
    staleTime: 60_000,
    retry: false,
  });
