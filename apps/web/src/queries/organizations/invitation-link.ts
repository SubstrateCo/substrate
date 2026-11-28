import { useMutation } from "@tanstack/react-query";

import { getInvitationLink } from "@/api/organizations/requests";

export function useInvitationLink(organizationId: string) {
  return useMutation({
    mutationFn: async (invitationId: string) =>
      (await getInvitationLink({ data: { organizationId, invitationId } })).url,
  });
}
