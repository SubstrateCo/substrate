import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";
import { queryKeys } from "@/queries/keys";

// Names, roles, and membership show in the switcher, the frame, and member lists. The detail
// key also covers the frame's summary and the people pickers.
const refreshOrganization = (queryClient: QueryClient, organizationId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
    queryClient.invalidateQueries({ queryKey: queryKeys.organizationDetail(organizationId) }),
  ]);

export function organizationMutationOptions(queryClient: QueryClient, organizationId: string) {
  const onSuccess = () => refreshOrganization(queryClient, organizationId);
  const rename = {
    mutationFn: async (name: string) =>
      unwrap(await authClient.organization.update({ organizationId, data: { name } })),
    onSuccess: () => refreshOrganization(queryClient, organizationId),
  };
  const changeRole = {
    mutationFn: async ({ memberId, role }: { memberId: string; role: OrganizationRole }) =>
      unwrap(await authClient.organization.updateMemberRole({ organizationId, memberId, role })),
    onSuccess,
  };
  const removeMember = {
    mutationFn: async (memberId: string) =>
      unwrap(
        await authClient.organization.removeMember({ organizationId, memberIdOrEmail: memberId }),
      ),
    onSuccess: async () => {
      // Removal also clears the person's conversation access.
      await Promise.all([
        onSuccess(),
        queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
      ]);
    },
  };
  return { rename, changeRole, removeMember };
}

export function useOrganizationMutations(organizationId: string) {
  const options = organizationMutationOptions(useQueryClient(), organizationId);
  return {
    rename: useMutation(options.rename),
    changeRole: useMutation(options.changeRole),
    removeMember: useMutation(options.removeMember),
  };
}
