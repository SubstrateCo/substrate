import { queryOptions } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";
import { queryKeys } from "@/queries/keys";

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
