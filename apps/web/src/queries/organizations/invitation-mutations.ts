import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { authError } from "@/api/auth/error";
import { authClient } from "@/lib/auth/client";

export function useInvitationMutations(organizationId: string) {
  const client = useQueryClient();
  const onSuccess = () =>
    client.invalidateQueries({ queryKey: queryKeys.invitations(organizationId) });
  const invite = useMutation({
    mutationFn: async ({
      email,
      role,
      resend = false,
    }: {
      email: string;
      role: "owner" | "admin" | "member";
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
    onSuccess,
  });
  const cancel = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({ invitationId });
      if (result.error) throw authError(result.error);
    },
    onSuccess,
  });
  return { invite, cancel };
}
