import { queryOptions, skipToken } from "@tanstack/react-query";

import { authClient } from "@/api/auth/client";
import { unwrap } from "@/api/auth/result";
import { getCurrentOrganization } from "@/api/organizations/requests";
import { queryKeys } from "@/queries/keys";

export const organizationsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.organizations,
    queryFn: async ({ signal }) =>
      unwrap(await authClient.organization.list({ fetchOptions: { signal } })),
  });

export const organizationQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.organizationDetail(organizationId),
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      unwrap(
        await authClient.organization.getFullOrganization({
          query: { organizationId },
          fetchOptions: { signal },
        }),
      ),
    retry: false,
  });

export const currentOrganizationQueryOptions = (organizationId: string | null | undefined) =>
  queryOptions({
    queryKey: queryKeys.organizationSummary(organizationId ?? ""),
    queryFn: organizationId
      ? ({ signal }) => getCurrentOrganization({ data: { organizationId }, signal })
      : skipToken,
    retry: false,
  });
