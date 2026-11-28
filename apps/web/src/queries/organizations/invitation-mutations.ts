import type { OrganizationRole } from "@substrate/contracts/auth/permissions";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { authClient } from "@/api/auth/client";
import { authError } from "@/api/auth/error";

export function useInvitationMutations(organizationId: string) {
  const client = useQueryClient();
  const onSettled = () =>
    client.invalidateQueries({ queryKey: queryKeys.invitations(organizationId) });
  const invite = useMutation({
    mutationFn: async ({
      email,
      role,
      resend = false,
    }: {
      email: string;
      role: OrganizationRole;
      resend?: boolean;
    }) => {
      const result = await authClient.organization.inviteMember({
        organizationId,
        email,
        role,
        resend,
      });
      if (result.error) throw authError(result.error);
    },
    onSettled,
  });
  const cancel = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({ invitationId });
      if (result.error) throw authError(result.error);
    },
    onSettled,
  });
  return { invite, cancel };
}
