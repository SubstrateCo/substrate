import type { UserAppId } from "@substrate/contracts/apps";

import { queryOptions, skipToken, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  getOrganizationApps,
  updateOrganizationApps,
  updatePersonalApp,
} from "@/api/organizations/apps";
import { queryKeys } from "@/queries/keys";

export const organizationAppsOptions = (
  organizationId: string | null | undefined,
  userId: string,
) =>
  queryOptions({
    queryKey: queryKeys.organizationApps(organizationId ?? "", userId),
    queryFn: organizationId
      ? ({ signal }) => getOrganizationApps({ data: { organizationId }, signal })
      : skipToken,
    // An "apps" hint reads this again at once. The poll only covers a lost hint.
    refetchOnReconnect: "always",
    refetchInterval: 5 * 60_000,
    retry: false,
  });

export function useUpdateOrganizationApps(organizationId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      enabledApps: Parameters<typeof updateOrganizationApps>[0]["data"]["enabledApps"],
    ) => updateOrganizationApps({ data: { organizationId, enabledApps } }),
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.organizationApps(organizationId, userId), settings);
    },
  });
}

export function useUpdatePersonalApp(organizationId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { appId: UserAppId; enabled: boolean }) =>
      updatePersonalApp({ data: { organizationId, ...input } }),
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.organizationApps(organizationId, userId), settings);
    },
  });
}
