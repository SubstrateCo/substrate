import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/queries/keys";

export function unwrap<T>(result: { data: T; error: { message?: string } | null }): NonNullable<T> {
  if (result.error)
    throw new Error(result.error.message || "The request failed. Please try again.");
  if (result.data == null) throw new Error("No data was returned. Please try again.");
  return result.data;
}

export const organizationsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.organizations,
    queryFn: async () => unwrap(await authClient.organization.list()),
  });

export const organizationQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.organizationDetail(organizationId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(await authClient.organization.getFullOrganization({ query: { organizationId } })),
    retry: false,
  });

export const activeMemberQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.activeMember(organizationId),
    queryFn: async () => ({
      ...unwrap(await authClient.organization.getActiveMemberRole({ query: { organizationId } })),
      organizationId,
    }),
    retry: false,
  });

export const invitationsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitations(organizationId),
    queryFn: async () =>
      unwrap(await authClient.organization.listInvitations({ query: { organizationId } })),
  });

export const invitationQueryOptions = (invitationId: string) =>
  queryOptions({
    queryKey: queryKeys.invitation(invitationId),
    queryFn: async () =>
      unwrap(await authClient.organization.getInvitation({ query: { id: invitationId } })),
    retry: false,
  });
