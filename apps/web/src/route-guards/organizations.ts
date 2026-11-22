import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/api/access-failure";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

/**
 * The active organization for routes that need one. Without an active organization, or without
 * access to it, the viewer picks a workspace again.
 */
export async function requireActiveOrganization(
  queryClient: QueryClient,
  organizationId: string | null | undefined,
  options?: { redirectTo?: "/organizations" | "/onboarding"; staleTime?: number },
) {
  const redirectTo = options?.redirectTo ?? "/organizations";
  const staleTime = options && "staleTime" in options ? options.staleTime : Infinity;
  if (!organizationId) throw redirect({ to: redirectTo });
  try {
    // Realtime organization and access hints and reconnect resyncs invalidate or reset this
    // entry, so a cached one is current and navigation does not wait for the network.
    const query = currentOrganizationQueryOptions(organizationId);
    const organization = await queryClient.query(
      staleTime === undefined ? query : { ...query, staleTime },
    );
    return { organizationId, organization };
  } catch (error) {
    if (error instanceof Error && isAccessFailure(error)) throw redirect({ to: redirectTo });
    throw error;
  }
}
