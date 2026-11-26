import { queryOptions, skipToken, useMutation, useQueryClient } from "@tanstack/react-query";

import { getOrganizationApps, updateOrganizationApps } from "@/api/organizations/apps";
import { queryKeys } from "@/queries/keys";

export const organizationAppsOptions = (organizationId: string | null | undefined) =>
  queryOptions({
    queryKey: queryKeys.organizationApps(organizationId ?? ""),
    queryFn: organizationId
      ? ({ signal }) => getOrganizationApps({ data: { organizationId }, signal })
      : skipToken,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchInterval: 30_000,
    retry: false,
  });

export function useUpdateOrganizationApps(organizationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      enabledApps: Parameters<typeof updateOrganizationApps>[0]["data"]["enabledApps"],
    ) => updateOrganizationApps({ data: { organizationId, enabledApps } }),
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.organizationApps(organizationId), settings);
    },
  });
}
