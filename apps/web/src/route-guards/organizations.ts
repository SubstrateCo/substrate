import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { isAccessFailure } from "@/api/access-failure";
import { currentOrganizationQueryOptions } from "@/queries/organizations/options";

const trustUntilInvalidated = { staleTime: Infinity };

export async function requireActiveOrganization(
  queryClient: QueryClient,
  organizationId: string | null | undefined,
  options?: {
    redirectTo?: "/organizations" | "/onboarding";
    fresh?: boolean;
  },
) {
  const redirectTo = options?.redirectTo ?? "/organizations";
  if (!organizationId) throw redirect({ to: redirectTo });
  try {
    const query = currentOrganizationQueryOptions(organizationId);
    const organization = await queryClient.query(
      options?.fresh ? query : { ...query, ...trustUntilInvalidated },
    );
    return { organizationId, organization };
  } catch (error) {
    if (error instanceof Error && isAccessFailure(error)) throw redirect({ to: redirectTo });
    throw error;
  }
}
