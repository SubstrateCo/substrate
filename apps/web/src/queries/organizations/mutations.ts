import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";
import type { OrganizationRole } from "@/lib/organizations/member-policy";
import { queryKeys } from "@/queries/keys";

// Names, roles, and membership show in the switcher, the frame, and member lists.
const refreshOrganization = (queryClient: QueryClient, organizationId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
    queryClient.invalidateQueries({ queryKey: queryKeys.organizationDetail(organizationId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activeMember(organizationId) }),
  ]);

export function useOrganizationMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => refreshOrganization(queryClient, organizationId);
  const rename = useMutation({
    mutationFn: async (name: string) =>
      unwrap(await authClient.organization.update({ organizationId, data: { name } })),
    onSuccess,
  });
  const changeRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: OrganizationRole }) =>
      unwrap(await authClient.organization.updateMemberRole({ organizationId, memberId, role })),
    onSuccess,
  });
  const removeMember = useMutation({
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
  });
  return { rename, changeRole, removeMember };
}
