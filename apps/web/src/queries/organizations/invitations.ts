import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/api/auth/client";
import { unwrap } from "@/api/auth/result";
import { queryKeys } from "@/queries/keys";

export const invitationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitations(organizationId),
    queryFn: async ({ signal }) =>
      unwrap(
        await authClient.organization.listInvitations({
          query: { organizationId },
          fetchOptions: { signal },
        }),
      ),
  });

export const userInvitationsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.userInvitations,
    queryFn: async ({ signal }) =>
      unwrap(await authClient.organization.listUserInvitations({ fetchOptions: { signal } })),
  });

export const invitationQueryOptions = (invitationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitation(invitationId),
    queryFn: async ({ signal }) =>
      unwrap(
        await authClient.organization.getInvitation({
          query: { id: invitationId },
          fetchOptions: { signal },
        }),
      ),
    retry: false,
  });
