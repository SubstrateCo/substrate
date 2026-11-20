import { useMutation } from "@tanstack/react-query";

import { getInvitationLink } from "@/api/organizations/requests";

/** Reads an invitation's shareable link on demand, the same link its email carries. */
export function useInvitationLink(organizationId: string) {
  return useMutation({
    mutationFn: async (invitationId: string) =>
      (await getInvitationLink({ data: { organizationId, invitationId } })).url,
  });
}
