import { useQuery } from "@tanstack/react-query";

import { isOrganizationAdmin } from "./admin-access";
import { authClient } from "@/api/auth-client";
import { api } from "@/api/client";
import { readResult } from "@/api/result";
import { queryKeys } from "@/queries/keys";

export function useOrganizationAdmin(organizationId: string) {
  const userId = authClient.useSession().data?.user.id ?? "";
  const access = useQuery({
    queryKey: [...queryKeys.workspace({ userId, organizationId }), "settings-access"],
    queryFn: ({ signal }) =>
      readResult(api.organizations["settings-access"].$get({}, { init: { signal } })),
    retry: false,
  });
  return {
    allowed: isOrganizationAdmin(access.data, organizationId),
    isPending: access.isPending,
    error: access.error,
    refetch: access.refetch,
  };
}
