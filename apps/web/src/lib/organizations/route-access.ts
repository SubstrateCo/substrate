import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/components/feedback/request-failure";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

/**
 * The active organization for routes that need one. Without an active organization, or without
 * access to it, the viewer picks a workspace again.
 */
export async function requireActiveOrganization(
  queryClient: QueryClient,
  organizationId: string | null | undefined,
) {
  if (!organizationId) throw redirect({ to: "/organizations" });
  try {
    // Realtime organization and access hints and reconnect resyncs invalidate or reset this
    // entry, so a cached one is current and navigation does not wait for the network.
    const organization = await queryClient.query({
      ...currentOrganizationQueryOptions(organizationId),
      staleTime: Infinity,
    });
    return { organizationId, organization };
  } catch (error) {
    if (error instanceof Error && isAccessFailure(error)) throw redirect({ to: "/organizations" });
    throw error;
  }
}
