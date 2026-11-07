import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";
import { queryKeys } from "@/queries/keys";

export const invitationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitations(organizationId),
    queryFn: async () =>
      unwrap(await authClient.organization.listInvitations({ query: { organizationId } })),
  });

export const userInvitationsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.userInvitations,
    queryFn: async () => unwrap(await authClient.organization.listUserInvitations()),
  });

export const invitationQueryOptions = (invitationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitation(invitationId),
    queryFn: async () =>
      unwrap(await authClient.organization.getInvitation({ query: { id: invitationId } })),
    retry: false,
  });
