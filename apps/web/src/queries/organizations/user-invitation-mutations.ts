import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { authClient } from "@/api/auth/client";
import { authError } from "@/api/auth/error";

/** The signed-in user declines an invitation sent to their email address. */
export function useDeclineInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.rejectInvitation({ invitationId });
      if (result.error) throw authError(result.error);
    },
    onSuccess: (_result, invitationId) =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.userInvitations }),
        client.invalidateQueries({ queryKey: queryKeys.invitation(invitationId), exact: true }),
      ]),
  });
}
