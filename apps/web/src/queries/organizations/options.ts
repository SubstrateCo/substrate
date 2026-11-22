import { queryOptions } from "@tanstack/react-query";

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

/** Members, invitations and settings. Organization settings screens use it. */
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

/** The organization's name and logo, and the viewer's role. The workspace frame holds it. */
export const currentOrganizationQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: queryKeys.organizationSummary(organizationId),
    queryFn: ({ signal }) => getCurrentOrganization({ data: { organizationId }, signal }),
    retry: false,
  });
